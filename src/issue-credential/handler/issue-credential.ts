import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { sessionRepository } from '@common/client/session-repository'
import { UnauthorisedError } from '@common/error/unauthorised-error'
import {
  errorHandler,
  httpHeaderNormalizer,
  injectLambdaContext,
  latencyRecorder,
  logMetrics,
  resultRecorder
} from '@common/handler/middleware'
import { auditEventPublisher } from '@common/service/audit-event-publisher'
import { parseBearerToken } from '@common/util/bearer-token'
import { logger } from '@govuk-one-login/cri-logger'
import { metrics } from '@govuk-one-login/cri-metrics'
import { identityScoreRepository } from '@src/issue-credential/client/identity-score-repository'
import { personDetailsRepository } from '@src/issue-credential/client/person-details-repository'
import { createIssueCredentialService } from '@src/issue-credential/service/issue-credential-service'
import { jwtEnvelopeGenerator } from '@src/issue-credential/service/jwt-envelope-generator'
import { verifiableCredentialBuilder } from '@src/issue-credential/service/verifiable-credential-builder'
import { verifiableCredentialSigner } from '@src/issue-credential/service/verifiable-credential-signer'

import middy from '@middy/core'

const issueCredentialService = createIssueCredentialService({
  auditEventPublisher,
  identityScoreRepository,
  jwtEnvelopeGenerator,
  personDetailsRepository,
  sessionRepository,
  verifiableCredentialBuilder,
  verifiableCredentialSigner
})

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Lambda invoked')
  const authorisation = event.headers?.['authorization']
  if (!authorisation) {
    throw new UnauthorisedError('You must provide a valid access token')
  }
  const accessToken = parseBearerToken(authorisation)
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
  .use(errorHandler()) // errorHandler is last
  .handler(lambdaHandler)
