import {
  formatThirdPartyTokenExpiryDateTime,
  getThirdPartyTokenName,
  isThirdPartyTokenExpired,
  isThirdPartyTokenNearExpiration
} from '@src/thirdparty-async-token-common/util/token-entity-util'
import { describe, expect, it } from 'vitest'

describe('token-entity-util', () => {
  describe('getThirdPartyTokenName', () => {
    it('concatenates prefix and suffix', () => {
      expect(getThirdPartyTokenName('model_a', '_async_token_key_ob')).toBe(
        'model_a_async_token_key_ob'
      )
    })
  })

  describe('formatThirdPartyTokenExpiryDateTime', () => {
    it('converts epoch seconds to ISO string', () => {
      expect(formatThirdPartyTokenExpiryDateTime(0)).toBe('1970-01-01T00:00:00.000Z')
    })
  })

  describe('isThirdPartyTokenNearExpiration', () => {
    it('returns false when token is not near expiration', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now + 600 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(false)
    })

    it('returns true when token is within expiration window', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now + 200 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(true)
    })

    it('returns true at exact boundary', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now + 300 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(true)
    })
  })

  describe('isThirdPartyTokenExpired', () => {
    it('returns false when token has time remaining beyond pad', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now + 60 }

      expect(isThirdPartyTokenExpired(entity)).toBe(false)
    })

    it('returns true when token is within 30s pad', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now + 20 }

      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })

    it('returns true when token ttl is in the past', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', tokenValue: 'v', ttl: now - 10 }

      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })
  })
})
