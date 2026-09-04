import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { createBaseHttpClient } from '@common/client/base-http-client'
import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { createSessionRepository } from '@common/client/session-repository'
import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { latencyRecorder, resultRecorder } from '@common/handler/middleware/recorders'
import { errorResponder } from '@common/handler/middleware/responders'
import { EndpointProfile } from '@common/model/endpoint-profile'
import { requireEnv } from '@common/util/env'
import { requireSessionId } from '@common/util/headers'
import { injectLambdaContext, logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import { createTokenRetrievalService } from '@govuk-one-login/cri-token-rotator'
import { createDynamoTokenRepository } from '@govuk-one-login/cri-token-rotator/dynamodb'
import { createConsentsRepository } from '@src/consents/client/consents-repository'
import { createEcospendConsentsProvider } from '@src/consents/client/ecospend-consents-provider'
import { createConsentsService } from '@src/consents/service/consents-service'

import middy from '@middy/core'
import httpHeaderNormalizer from '@middy/http-header-normalizer'

const consentsConfigPathPrefix = `/${requireEnv('PARAMETER_PREFIX')}/consents`

const sessionRepository = createSessionRepository(
  { tableName: requireEnv('SESSION_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const dynamoTokenRepository = createDynamoTokenRepository(
  { tableName: requireEnv('TOKEN_ROTATOR_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const consentsRepository = createConsentsRepository(
  { tableName: requireEnv('CONSENTS_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const tokenRetrievalService = createTokenRetrievalService(
  { profiles: Object.values(EndpointProfile) },
  { tokenRepository: dynamoTokenRepository }
)

const consentsProvider = createEcospendConsentsProvider({
  httpClient: createBaseHttpClient({ endpointName: 'ecospend-consents' })
})

const consentsService = createConsentsService(
  { consentsConfigPathPrefix },
  {
    consentsProvider,
    consentsRepository,
    externalConfigProvider: ssmConfigProvider,
    sessionRepository,
    tokenRetrievalService
  }
)

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Lambda invoked')
  const sessionId = requireSessionId(event.headers?.['session-id'])

  const consentsResponse = await consentsService({ sessionId, eventBody: event.body })

  return {
    body: JSON.stringify(consentsResponse),
    headers: { 'Content-Type': 'application/json' },
    statusCode: consentsResponse.cached ? 200 : 201
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
