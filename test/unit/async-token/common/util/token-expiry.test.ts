import {
  calculateItemTtl,
  formatThirdPartyTokenExpiryDateTime,
  isThirdPartyTokenExpired,
  isThirdPartyTokenNearExpiration
} from '@src/async-token/common/util/token-expiry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('token-expiry', () => {
  describe('calculateItemTtl', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns the current epoch second plus the max lifetime', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const nowSeconds = Math.floor(Date.now() / 1000)

      expect(calculateItemTtl(3600)).toBe(nowSeconds + 3600)
    })

    it('floors sub-second precision to whole epoch seconds', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.750Z'))
      const nowSeconds = Math.floor(Date.now() / 1000)

      expect(calculateItemTtl(100)).toBe(nowSeconds + 100)
    })

    it('returns the current epoch second when lifetime is zero', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const nowSeconds = Math.floor(Date.now() / 1000)

      expect(calculateItemTtl(0)).toBe(nowSeconds)
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
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 600 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(false)
    })

    it('returns true when token is within expiration window', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 200 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(true)
    })

    it('returns true at exact boundary', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 300 }

      expect(isThirdPartyTokenNearExpiration(entity, 300)).toBe(true)
    })
  })

  describe('isThirdPartyTokenExpired', () => {
    it('returns false when time remaining is beyond the entity pad', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 60 }

      expect(isThirdPartyTokenExpired(entity)).toBe(false)
    })

    it('returns false just outside the pad boundary', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 31 }

      expect(isThirdPartyTokenExpired(entity)).toBe(false)
    })

    it('returns true at the exact pad boundary', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 30 }

      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })

    it('returns true when the token is within the pad', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now + 20 }

      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })

    it('returns true when the token ttl is in the past', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 30, tokenValue: 'v', ttl: now - 10 }

      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })

    it('respects a larger entity pad', () => {
      const now = Math.floor(Date.now() / 1000)
      const entity = { id: 'x', pad: 300, tokenValue: 'v', ttl: now + 200 }

      // now >= (now + 200) - 300  ->  true
      expect(isThirdPartyTokenExpired(entity)).toBe(true)
    })
  })
})
