import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConfig = vi.fn()
const mockInfo = vi.fn()

vi.mock('@common/client/ssm-config-provider', () => ({
  ssmConfigProvider: { getConfig: mockGetConfig }
}))

vi.mock('@common/util/env', () => ({
  requireEnv: (name: string) => {
    const envs: Record<string, string> = {
      THIRDPARTY_TOKEN_PLUGIN_NAME: 'ob_token_plugin',
      THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT: '/ssm/root'
    }
    return envs[name] ?? ''
  }
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { info: mockInfo }
}))

describe('createThirdPartyTokenPluginConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns valid config when SSM values are within allowed bounds', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A|PROFILE_B',
      maxAllowedLifetimeSeconds: '3600',
      tokenExpirationWindowSeconds: '300'
    })

    const { thirdPartyTokenPluginConfig } =
      await import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')

    expect(thirdPartyTokenPluginConfig.pluginName).toBe('ob_token_plugin')
    expect(thirdPartyTokenPluginConfig.tokenItemSuffix).toBe('_token_ob_token_plugin')
    expect(thirdPartyTokenPluginConfig.maxLifetimeSeconds).toBe(3600)
    expect(thirdPartyTokenPluginConfig.expirationWindowSeconds).toBe(300)
    expect(thirdPartyTokenPluginConfig.itemTtlSeconds).toBe(3300)
    expect(thirdPartyTokenPluginConfig.enabledProfiles).toEqual(['PROFILE_A', 'PROFILE_B'])
    expect(mockGetConfig).toHaveBeenCalledWith('/ssm/root/ob_token_plugin/config')
  })

  it('logs config values including calculated itemTtlSeconds on valid config', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A',
      maxAllowedLifetimeSeconds: '3600',
      tokenExpirationWindowSeconds: '300'
    })

    await import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('ob_token_plugin'))
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('itemTtlSeconds(calculated)=3300')
    )
  })

  it('throws when itemTtlSeconds is less than 300', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A',
      maxAllowedLifetimeSeconds: '400',
      tokenExpirationWindowSeconds: '200'
    })

    await expect(
      import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')
    ).rejects.toThrow('itemTtlSeconds must be at least 300')
  })

  it('throws when expirationWindowSeconds is less than 60', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A',
      maxAllowedLifetimeSeconds: '3600',
      tokenExpirationWindowSeconds: '30'
    })

    await expect(
      import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')
    ).rejects.toThrow('expirationWindowSeconds must be at least 60')
  })

  it('throws when expirationWindowSeconds is greater than or equal to itemTtlSeconds', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A',
      maxAllowedLifetimeSeconds: '1200',
      tokenExpirationWindowSeconds: '700'
    })

    await expect(
      import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')
    ).rejects.toThrow('expirationWindowSeconds must be less than itemTtlSeconds')
  })

  it('throws when expiration window equals max lifetime', async () => {
    mockGetConfig.mockResolvedValue({
      enabledProfiles: 'PROFILE_A',
      maxAllowedLifetimeSeconds: '3600',
      tokenExpirationWindowSeconds: '3600'
    })

    await expect(
      import('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config')
    ).rejects.toThrow('itemTtlSeconds must be at least 300')
  })
})
