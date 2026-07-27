import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import {
  errorHandler,
  httpHeaderNormalizer,
  injectLambdaContext,
  latencyRecorder,
  logMetrics,
  resultRecorder
} from '@common/handler/middleware'
import { getConfigProfileNameFromClientId } from '@common/util/client-config-profile-resolver'
import { logger } from '@govuk-one-login/cri-logger'
import { metrics } from '@govuk-one-login/cri-metrics'
import { thirdPartyTokenRepository } from '@src/thirdparty-async-token-common/client/token-repository'
import { createThirdPartyTokenRetrievalService } from '@src/thirdparty-async-token-consumer/service/token-retrieval-service'
import { thirdPartyTokenPluginConfig } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'

import middy from '@middy/core'

logger.info('Initializing Basic Function Lambda...')

const thirdPartyTokenRetrievalService = createThirdPartyTokenRetrievalService(
  thirdPartyTokenRepository,
  thirdPartyTokenPluginConfig
)

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Lambda invoked')

  // ThirdParty Token Example
  const clientIdFromSessionItem = 'ipv-core'
  const configProfileName = getConfigProfileNameFromClientId(clientIdFromSessionItem)
  const tokenValue =
    await thirdPartyTokenRetrievalService.retrieveTokenForConfigProfileName(configProfileName)

  logger.info(`Token retrieved: ${!!tokenValue}`)

  if (!tokenValue) {
    logger.error('Unable to retrieve token')

    return {
      body: JSON.stringify({
        // oauth_error aligns with Limes use of common-expresses error handler
        oauth_error: {
          error: 'server_error',
          error_description: 'Unexpected server error'
        }
      }),
      statusCode: 500
    }
  }

  return {
    body: JSON.stringify({
      message: 'Successfully executed',
      path: event.path
    }),
    statusCode: 200
  }
}

export const handler = middy<APIGatewayProxyEvent, APIGatewayProxyResult>()
  .use(latencyRecorder())
  .use(resultRecorder())
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .use(httpHeaderNormalizer())
  .use(errorHandler())
  .handler(lambdaHandler)
