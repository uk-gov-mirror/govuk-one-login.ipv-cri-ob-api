import type { MiddlewareObj } from '@middy/core'
import type { Context } from 'aws-lambda'

import {
  LAMBDA_LATENCY_METRIC_NAME,
  LAMBDA_RESULT_METRIC_NAME,
  LambdaMetricDimensions,
  LambdaResult,
  LambdaStartState
} from '@common/model/metrics/lambda-metrics'
import { captureMetricWithDimensions, MetricUnit } from '@govuk-one-login/cri-metrics'

const latencyRecorder = <TEvent, TResult>(): MiddlewareObj<TEvent, TResult> => {
  const startTimes = new WeakMap<object, number>()
  let startState: LambdaStartState = LambdaStartState.COLD

  const emit = (request: { context: Context }): void => {
    const start = startTimes.get(request)
    if (start === undefined) return
    captureMetricWithDimensions(
      LAMBDA_LATENCY_METRIC_NAME,
      {
        [LambdaMetricDimensions.LAMBDA]: request.context.functionName,
        [LambdaMetricDimensions.START_STATE]: startState
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

const resultRecorder = <TEvent, TResult>(): MiddlewareObj<TEvent, TResult> => {
  const emit = (request: { context: Context }, result: LambdaResult): void => {
    captureMetricWithDimensions(
      LAMBDA_RESULT_METRIC_NAME,
      {
        [LambdaMetricDimensions.LAMBDA]: request.context.functionName,
        [LambdaMetricDimensions.RESULT]: result
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

export { latencyRecorder, resultRecorder }
