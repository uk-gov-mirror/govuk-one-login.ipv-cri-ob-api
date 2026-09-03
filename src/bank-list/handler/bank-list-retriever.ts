import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { sessionRepository } from '@common/client/session-repository'
import {
  errorHandler,
  httpHeaderNormalizer,
  injectLambdaContext,
  latencyRecorder,
  logMetrics,
  resultRecorder
} from '@common/handler/middleware'
import { parseSessionId } from '@common/util/session-id'
import { logger } from '@govuk-one-login/cri-logger'
import { metrics } from '@govuk-one-login/cri-metrics'
import { getBankListRepository } from '@src/bank-list/client/bank-list-repository'
import { createBankListRetrievalService } from '@src/bank-list/service/bank-list-retrieval-service'

import middy from '@middy/core'

const bankListRetrievalService = createBankListRetrievalService({
  sessionRepository,
  bankListRepository: getBankListRepository()
})

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Lambda invoked')
  const sessionId = parseSessionId(event.headers?.['session-id'])

  const { bankList } = await bankListRetrievalService({ sessionId })

  return {
    body: JSON.stringify(bankList),
    headers: { 'Content-Type': 'application/json' },
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
