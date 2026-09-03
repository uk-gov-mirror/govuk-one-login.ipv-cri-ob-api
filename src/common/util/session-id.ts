import { UnauthorisedError } from '@common/error/unauthorised-error'

export const parseSessionId = (header: string | undefined): string => {
  const sessionId = header?.trim()
  if (!sessionId) {
    throw new UnauthorisedError('session-id is empty')
  }
  return sessionId
}
