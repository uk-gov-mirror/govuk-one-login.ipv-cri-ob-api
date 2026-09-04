import type { MiddlewareObj } from '@middy/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import {
  isCfnCustomResourceEvent,
  putCustomResourceResponse
} from '@common/util/cfn-custom-resource'
import { formatErrorResponse } from '@govuk-one-login/cri-error-response'
import { logger } from '@govuk-one-login/cri-logger'

const cfnCustomResourceEventResponder = (): MiddlewareObj<unknown, unknown> => ({
  after: async (request) => {
    if (!isCfnCustomResourceEvent(request.event)) return
    logger.info('Deployment success')
    await putCustomResourceResponse(request.event, { status: 'SUCCESS' })
  },
  onError: async (request) => {
    if (!isCfnCustomResourceEvent(request.event)) return
    const reason = request.error instanceof Error ? request.error.message : 'Unknown error'
    logger.error('Deployment failed', { reason })
    await putCustomResourceResponse(request.event, { status: 'FAILED', reason })
    request.response = null
  }
})

const errorResponder = (): MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => ({
  onError: (request) => {
    request.response = formatErrorResponse(request.error)
  }
})

export { cfnCustomResourceEventResponder, errorResponder }
