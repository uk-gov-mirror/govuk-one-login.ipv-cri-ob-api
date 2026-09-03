import type * as CriMetricsModule from '@govuk-one-login/cri-metrics'
import type { PersonIdentityItem, SessionItem } from '@govuk-one-login/cri-types'
import type { IdentityCheckCredentialJWTClass } from '@govuk-one-login/data-vocab/credentials'
import type { IdentityScore } from '@src/issue-credential/model/identity-score'
import type { APIGatewayProxyEvent, Context } from 'aws-lambda'

import { MetricUnit } from '@govuk-one-login/cri-metrics'
import { handler } from '@src/issue-credential/handler/issue-credential'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as sessionRepository from '@common/client/session-repository'
import * as auditEventPublisher from '@common/service/audit-event-publisher'
import * as criMetrics from '@govuk-one-login/cri-metrics'
import * as identityScoreRepository from '@src/issue-credential/client/identity-score-repository'
import * as personDetailsRepository from '@src/issue-credential/client/person-details-repository'
import * as jwtEnvelopeGenerator from '@src/issue-credential/service/jwt-envelope-generator'
import * as verifiableCredentialBuilder from '@src/issue-credential/service/verifiable-credential-builder'
import * as verifiableCredentialSigner from '@src/issue-credential/service/verifiable-credential-signer'

vi.mock('@govuk-one-login/cri-metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof CriMetricsModule>()),
  captureMetricWithDimensions: vi.fn()
}))

const buildEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    headers: { Authorization: 'Bearer abc.def.ghi' },
    path: '/credential/issue',
    ...overrides
  }) as APIGatewayProxyEvent

const buildSession = (): SessionItem =>
  ({
    attemptCount: 0,
    clientId: 'test-client',
    clientSessionId: 'client-session-1',
    createdDate: 0,
    expiryDate: 0,
    redirectUri: 'https://example.test/callback',
    sessionId: 'session-123',
    state: 'test-state',
    subject: 'subject-xyz'
  }) as SessionItem

const buildPersonDetails = (): PersonIdentityItem =>
  ({
    birthDates: [{ value: '1970-01-01' }],
    expiryDate: 0,
    names: [
      {
        nameParts: [
          { type: 'GivenName', value: 'Alice' },
          { type: 'FamilyName', value: 'Doe' }
        ]
      }
    ],
    sessionId: 'session-123'
  }) as PersonIdentityItem

const buildIdentityScore = (): IdentityScore => ({
  checkDetails: ['data', 'auth'],
  contraIndicators: [],
  failedCheckDetails: [],
  sessionId: 'session-123',
  strengthScore: 3,
  transactionId: 'txn-1',
  ttl: 0,
  validityScore: 2,
  verificationScore: 3
})

const buildContext = (): Context => ({ functionName: 'issue-credential-test' }) as Context

const buildClaimSet = (): IdentityCheckCredentialJWTClass => ({
  exp: 1,
  iss: 'iss',
  jti: 'jti',
  nbf: 0,
  sub: 'subject-xyz',
  vc: {
    credentialSubject: {},
    evidence: [{ type: 'IdentityCheck' }],
    type: ['VerifiableCredential', 'IdentityCheckCredential']
  }
})

const stubHappyPath = (): void => {
  vi.spyOn(sessionRepository.sessionRepository, 'findByAccessToken').mockResolvedValue(
    buildSession()
  )
  vi.spyOn(personDetailsRepository.personDetailsRepository, 'findBySessionId').mockResolvedValue(
    buildPersonDetails()
  )
  vi.spyOn(identityScoreRepository.identityScoreRepository, 'findBySessionId').mockResolvedValue(
    buildIdentityScore()
  )
  vi.spyOn(jwtEnvelopeGenerator.jwtEnvelopeGenerator, 'generate').mockReturnValue({
    exp: 1,
    iss: 'iss',
    jti: 'jti',
    nbf: 0,
    sub: 'subject-xyz'
  })
  vi.spyOn(verifiableCredentialBuilder.verifiableCredentialBuilder, 'build').mockReturnValue(
    buildClaimSet()
  )
  vi.spyOn(verifiableCredentialSigner.verifiableCredentialSigner, 'sign').mockResolvedValue(
    'signed.jwt.value'
  )
  vi.spyOn(auditEventPublisher.auditEventPublisher, 'publishVCIssued').mockResolvedValue()
  vi.spyOn(auditEventPublisher.auditEventPublisher, 'publishJourneyEnd').mockResolvedValue()
}

describe('issue-credential handler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('returns 200 with the signed credential as application/jwt', async () => {
    stubHappyPath()

    const result = await handler(buildEvent(), buildContext())

    expect(result.statusCode).toBe(200)
    expect(result.headers?.['Content-Type']).toBe('application/jwt')
    expect(result.body).toBe('signed.jwt.value')
  })

  it('returns 401 when the Authorization header is missing', async () => {
    const result = await handler(buildEvent({ headers: {} }), buildContext())

    expect(result.statusCode).toBe(401)
  })

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const result = await handler(
      buildEvent({ headers: { Authorization: 'Basic abc' } }),
      buildContext()
    )

    expect(result.statusCode).toBe(401)
  })

  it('returns 401 when the access token does not map to a session', async () => {
    vi.spyOn(sessionRepository.sessionRepository, 'findByAccessToken').mockResolvedValue(undefined)

    const result = await handler(buildEvent(), buildContext())

    expect(result.statusCode).toBe(401)
  })

  it('returns 500 when person details are missing for the session', async () => {
    stubHappyPath()
    vi.spyOn(personDetailsRepository.personDetailsRepository, 'findBySessionId').mockResolvedValue(
      undefined
    )

    const result = await handler(buildEvent(), buildContext())

    expect(result.statusCode).toBe(500)
  })

  it('returns 500 when the identity score is missing for the session', async () => {
    stubHappyPath()
    vi.spyOn(identityScoreRepository.identityScoreRepository, 'findBySessionId').mockResolvedValue(
      undefined
    )

    const result = await handler(buildEvent(), buildContext())

    expect(result.statusCode).toBe(500)
  })

  it('emits lambda_result=success and lambda_latency_ms on the happy path', async () => {
    stubHappyPath()

    await handler(buildEvent(), buildContext())

    expect(criMetrics.captureMetricWithDimensions).toHaveBeenCalledWith(
      'lambda_result',
      { lambda: 'issue-credential-test', result: 'success' },
      1,
      MetricUnit.Count
    )
    expect(criMetrics.captureMetricWithDimensions).toHaveBeenCalledWith(
      'lambda_latency_ms',
      { lambda: 'issue-credential-test', start_state: expect.toBeOneOf(['cold', 'hot']) as string },
      expect.any(Number),
      MetricUnit.Milliseconds
    )
  })

  it('emits lambda_result=error and lambda_latency_ms when the handler fails', async () => {
    await handler(buildEvent({ headers: {} }), buildContext())

    expect(criMetrics.captureMetricWithDimensions).toHaveBeenCalledWith(
      'lambda_result',
      { lambda: 'issue-credential-test', result: 'error' },
      1,
      MetricUnit.Count
    )
    expect(criMetrics.captureMetricWithDimensions).toHaveBeenCalledWith(
      'lambda_latency_ms',
      { lambda: 'issue-credential-test', start_state: expect.toBeOneOf(['cold', 'hot']) as string },
      expect.any(Number),
      MetricUnit.Milliseconds
    )
  })
})
