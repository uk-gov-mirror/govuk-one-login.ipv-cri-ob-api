import { getThirdPartyTokenName } from '@src/async-token/common/util/token-naming'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('token-naming', () => {
  describe('getThirdPartyTokenName', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('constructs token name from prefix and plugin name env var', () => {
      vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'ob-token-plugin')

      expect(getThirdPartyTokenName('MY-PROFILE-NAME')).toBe(
        'MY-PROFILE-NAME-token-ob-token-plugin'
      )
    })

    it('throws if THIRDPARTY_TOKEN_PLUGIN_NAME is not set', () => {
      vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', '')

      expect(() => getThirdPartyTokenName('MY-PROFILE-NAME')).toThrow(
        'THIRDPARTY_TOKEN_PLUGIN_NAME'
      )
    })
  })
})
