import type * as CfnResourceModule from '@common/util/cfn-custom-resource'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import {
  cfnCustomResourceEventResponder,
  errorResponder
} from '@common/handler/middleware/responders'
import { putCustomResourceResponse } from '@common/util/cfn-custom-resource'
import { CriError } from '@govuk-one-login/cri-error-response'
import { logger } from '@govuk-one-login/cri-logger'
import { buildCfnCustomResourceEvent } from '@test-fixtures/aws/cfn-custom-resource-event'
import { buildMiddyRequest } from '@test-fixtures/middy/request'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@common/util/cfn-custom-resource', async (importOriginal) => ({
  ...(await importOriginal<typeof CfnResourceModule>()),
  putCustomResourceResponse: vi.fn()
}))

describe('cfnCustomResourceEventResponder', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('after', () => {
    it('sends SUCCESS when the event is a CFN custom resource', async () => {
      const event = buildCfnCustomResourceEvent('Create')

      await cfnCustomResourceEventResponder().after!(buildMiddyRequest(event))

      expect(putCustomResourceResponse).toHaveBeenCalledWith(event, { status: 'SUCCESS' })
    })

    it('does nothing when the event is not a CFN custom resource', async () => {
      await cfnCustomResourceEventResponder().after!(buildMiddyRequest({ source: 'aws.events' }))

      expect(putCustomResourceResponse).not.toHaveBeenCalled()
    })
  })

  describe('onError', () => {
    it('sends FAILED with the Error message and clears the response', async () => {
      const event = buildCfnCustomResourceEvent('Create')
      const request = buildMiddyRequest(event, { error: new Error('crumbs') })

      await cfnCustomResourceEventResponder().onError!(request)

      expect(putCustomResourceResponse).toHaveBeenCalledWith(event, {
        reason: 'crumbs',
        status: 'FAILED'
      })
      expect(request.response).toBeNull()
    })

    it('sends FAILED with "Unknown error" when the rejection is not an Error', async () => {
      const event = buildCfnCustomResourceEvent('Create')

      await cfnCustomResourceEventResponder().onError!(
        buildMiddyRequest(event, { error: 'crumbs' })
      )

      expect(putCustomResourceResponse).toHaveBeenCalledWith(event, {
        reason: 'Unknown error',
        status: 'FAILED'
      })
    })

    it('does nothing when the event is not a CFN custom resource', async () => {
      await cfnCustomResourceEventResponder().onError!(
        buildMiddyRequest({ source: 'aws.events' }, { error: new Error('crumbs') })
      )

      expect(putCustomResourceResponse).not.toHaveBeenCalled()
    })
  })
})

describe('errorResponder', () => {
  it('responds with the CriError statusCode when a CriError is thrown', () => {
    const request = buildMiddyRequest<APIGatewayProxyEvent, APIGatewayProxyResult>(
      {},
      { error: new CriError(401, 'unauthorised') }
    )

    errorResponder().onError!(request)

    expect(request.response?.statusCode).toBe(401)
  })

  it('responds with 500 and logs a redacted error when an unexpected error is thrown', () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const request = buildMiddyRequest<APIGatewayProxyEvent, APIGatewayProxyResult>(
      {},
      { error: new Error('crumbs') }
    )

    errorResponder().onError!(request)

    expect(request.response!.statusCode).toBe(500)
    expect(JSON.parse(request.response!.body)).toStrictEqual({
      message: 'Internal server error'
    })
    expect(loggerSpy).toHaveBeenCalledWith('Unhandled Error: Error', {
      errorMessage: 'redacted',
      stack: 'redacted'
    })

    loggerSpy.mockRestore()
  })
})
