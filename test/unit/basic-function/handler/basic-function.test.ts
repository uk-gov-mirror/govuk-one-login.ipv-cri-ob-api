import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRetrieveToken } = vi.hoisted(() => ({
  mockRetrieveToken: vi.fn()
}))

vi.mock('@common/handler/middleware', () => ({
  errorHandler: () => ({ after: vi.fn(), before: vi.fn(), onError: vi.fn() }),
  httpHeaderNormalizer: () => ({ after: vi.fn(), before: vi.fn() }),
  injectLambdaContext: () => ({ after: vi.fn(), before: vi.fn() }),
  latencyRecorder: () => ({ after: vi.fn(), before: vi.fn() }),
  logMetrics: () => ({ after: vi.fn(), before: vi.fn() }),
  resultRecorder: () => ({ after: vi.fn(), before: vi.fn() })
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() }
}))

vi.mock('@govuk-one-login/cri-metrics', () => ({
  metrics: {}
}))

vi.mock('@src/async-token/consumer/token-retrieval', () => ({
  retrieveToken: mockRetrieveToken
}))

vi.mock('@middy/core', () => ({
  default: () => ({
    handler: vi.fn().mockImplementation((fn: unknown) => fn),
    use: vi.fn().mockReturnThis()
  })
}))

import { handler } from '@src/basic-function/handler/basic-function'

const buildEvent = (overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent =>
  ({ path: '/basic-function', ...overrides }) as APIGatewayProxyEvent

const invokeHandler = (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> =>
  (handler as unknown as (e: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>)(event)

describe('basic-function handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRetrieveToken.mockResolvedValue('mock-token')
  })

  it('returns 200 with message and path when token is retrieved', async () => {
    const result = await invokeHandler(buildEvent())

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({
      message: 'Successfully executed',
      path: '/basic-function'
    })
  })

  it('returns 500 with oauth_error when token retrieval returns undefined', async () => {
    mockRetrieveToken.mockResolvedValue(undefined)

    const result = await invokeHandler(buildEvent())

    expect(result.statusCode).toBe(500)
    expect(JSON.parse(result.body)).toEqual({
      oauth_error: {
        error: 'server_error',
        error_description: 'Unexpected server error'
      }
    })
  })
})
