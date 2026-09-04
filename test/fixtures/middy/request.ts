import type { Request } from '@middy/core'
import type { Context } from 'aws-lambda'

interface Options<R> {
  error?: unknown
  functionName?: string
  response?: null | R
}

export const buildMiddyRequest = <E = unknown, R = unknown>(
  event: Partial<E>,
  { error = null, functionName = 'test-fn', response = null }: Options<R> = {}
): Request<E, R> => ({
  context: { functionName } as Context,
  error: error as Error | null,
  event: event as E,
  internal: {},
  response
})
