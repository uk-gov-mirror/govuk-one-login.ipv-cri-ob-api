import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { createIdentityScoreRepository } from '@common/client/identity-score-repository'
import { createPersonIdentityRepository } from '@common/client/person-identity-repository'
import { createSessionRepository } from '@common/client/session-repository'
import { latencyRecorder, resultRecorder } from '@common/handler/middleware/recorders'
import { errorResponder } from '@common/handler/middleware/responders'
import { auditEventPublisher } from '@common/service/audit-event-publisher'
import { requireEnv } from '@common/util/env'
import { requireBearerToken } from '@common/util/headers'
import { injectLambdaContext, logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import { createIssueCredentialService } from '@src/issue-credential/service/issue-credential-service'
import { jwtEnvelopeGenerator } from '@src/issue-credential/service/jwt-envelope-generator'
import { verifiableCredentialBuilder } from '@src/issue-credential/service/verifiable-credential-builder'
import { verifiableCredentialSigner } from '@src/issue-credential/service/verifiable-credential-signer'

import middy from '@middy/core'
import httpHeaderNormalizer from '@middy/http-header-normalizer'

const sessionRepository = createSessionRepository(
  { tableName: requireEnv('SESSION_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const personIdentityRepository = createPersonIdentityRepository(
  { tableName: requireEnv('PERSON_IDENTITY_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const identityScoreRepository = createIdentityScoreRepository(
  { tableName: requireEnv('IDENTITY_SCORE_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const issueCredentialService = createIssueCredentialService({
  auditEventPublisher,
  identityScoreRepository,
  jwtEnvelopeGenerator,
  personIdentityRepository,
  sessionRepository,
  verifiableCredentialBuilder,
  verifiableCredentialSigner
})

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Lambda invoked')
  const accessToken = requireBearerToken(event.headers?.['authorization'])
  const { credential } = await issueCredentialService({ accessToken })
  return {
    body: credential,
    headers: { 'Content-Type': 'application/jwt' },
    statusCode: 200
  }
}

export const handler = middy<APIGatewayProxyEvent, APIGatewayProxyResult>()
  .use(latencyRecorder()) // latencyRecorder is first
  .use(resultRecorder())
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .use(httpHeaderNormalizer())
  .use(errorResponder()) // errorResponder is last
  .handler(lambdaHandler)
