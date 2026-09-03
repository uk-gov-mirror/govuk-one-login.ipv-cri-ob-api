import { UnauthorisedError } from '@common/error/unauthorised-error'
import { parseSessionId } from '@src/common/util/session-id'
import { describe, expect, it } from 'vitest'

describe('parseSessionId', () => {
  it('returns the session id when the header is set', () => {
    expect(parseSessionId('11111111-1111-1111-1111-111111111111')).toBe(
      '11111111-1111-1111-1111-111111111111'
    )
  })

  it('trims whitespace', () => {
    expect(parseSessionId('  abc  ')).toBe('abc')
  })

  it('throws UnauthorisedError when the header is undefined', () => {
    expect(() => parseSessionId(undefined)).toThrow(UnauthorisedError)
  })

  it('throws UnauthorisedError when the header is empty', () => {
    expect(() => parseSessionId('')).toThrow(UnauthorisedError)
  })

  it('throws UnauthorisedError when the header is only whitespace', () => {
    expect(() => parseSessionId('   ')).toThrow(UnauthorisedError)
  })
})
