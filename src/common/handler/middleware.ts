import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'

import {
  LAMBDA_LATENCY_METRIC_NAME,
  LAMBDA_RESULT_METRIC_NAME,
  LambdaMetricDimensions,
  LambdaResult,
  LambdaStartState
} from '@common/model/metrics/lambda-metrics'
import { formatErrorResponse } from '@govuk-one-login/cri-error-response'
import { captureMetricWithDimensions, MetricUnit } from '@govuk-one-login/cri-metrics'

export { injectLambdaContext } from '@govuk-one-login/cri-logger'
export { logMetrics } from '@govuk-one-login/cri-metrics'
export { default as httpHeaderNormalizer } from '@middy/http-header-normalizer'

// This is best used on API Gateway interfaced lambdas, not async event rule invoked lambdas
// TODO this need changed, this will leak internal error messages to the user
export const errorHandler = (): MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => ({
  onError: (request) => {
    request.response = formatErrorResponse(request.error)
  }
})

export const latencyRecorder = (): MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => {
  const startTimes = new WeakMap<object, number>()
  let startState: LambdaStartState = LambdaStartState.COLD

  const emit = (request: { context: Context }): void => {
    const start = startTimes.get(request)
    if (start === undefined) return
    captureMetricWithDimensions(
      LAMBDA_LATENCY_METRIC_NAME,
      {
        [LambdaMetricDimensions.Lambda]: request.context.functionName,
        [LambdaMetricDimensions.StartState]: startState
      },
      performance.now() - start,
      MetricUnit.Milliseconds
    )
    startState = LambdaStartState.HOT
  }

  return {
    after: emit,
    before: (request) => {
      startTimes.set(request, performance.now())
    },
    onError: emit
  }
}

export const resultRecorder = (): MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => {
  const emit = (request: { context: Context }, result: LambdaResult): void => {
    captureMetricWithDimensions(
      LAMBDA_RESULT_METRIC_NAME,
      {
        [LambdaMetricDimensions.Lambda]: request.context.functionName,
        [LambdaMetricDimensions.Result]: result
      },
      1,
      MetricUnit.Count
    )
  }

  return {
    after: (request) => {
      emit(request, LambdaResult.SUCCESS)
    },
    onError: (request) => {
      emit(request, LambdaResult.ERROR)
    }
  }
}
