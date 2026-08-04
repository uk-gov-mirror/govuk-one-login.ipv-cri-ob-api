import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetConfig, mockInfo } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockInfo: vi.fn()
}))

vi.mock('@common/client/ssm-config-provider', () => ({
  ssmConfigProvider: { getConfig: mockGetConfig }
}))

vi.mock('@common/util/env', () => ({
  requireEnv: (name: string) => {
    const envs: Record<string, string> = {
      THIRDPARTY_TOKEN_PLUGIN_NAME: 'ob-token-plugin',
      THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT: '/ssm/root'
    }
    return envs[name] ?? ''
  }
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { info: mockInfo }
}))

const buildSsmConfig = (overrides?: Record<string, string>) => ({
  enabledProfiles: 'PROFILE_A|PROFILE_B',
  tokenExpirationPadSeconds: '30',
  tokenExpirationWindowSeconds: '300',
  tokenMaxAllowedLifetimeSeconds: '3600',
  ...overrides
})

describe('createThirdPartyTokenPluginConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns valid config when SSM values are within allowed bounds', async () => {
    mockGetConfig.mockResolvedValue(buildSsmConfig())

    const { thirdPartyTokenPluginConfig } =
      await import('@src/async-token/plugin-api/token-plugin-config')

    expect(thirdPartyTokenPluginConfig.pluginName).toBe('ob-token-plugin')
    expect(thirdPartyTokenPluginConfig.tokenMaxAllowedLifetimeSeconds).toBe(3600)
    expect(thirdPartyTokenPluginConfig.tokenExpirationWindowSeconds).toBe(300)
    expect(thirdPartyTokenPluginConfig.tokenExpirationPadSeconds).toBe(30)
    expect(thirdPartyTokenPluginConfig.enabledProfiles).toEqual(['PROFILE_A', 'PROFILE_B'])
    expect(mockGetConfig).toHaveBeenCalledWith('/ssm/root/ob-token-plugin/config')
  })

  it('logs config values on valid config', async () => {
    mockGetConfig.mockResolvedValue(buildSsmConfig({ enabledProfiles: 'PROFILE_A' }))

    await import('@src/async-token/plugin-api/token-plugin-config')

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('ob-token-plugin'))
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('tokenExpirationPadSeconds=30'))
  })

  it('throws when the expiration window is shorter than two scheduler intervals', async () => {
    mockGetConfig.mockResolvedValue(buildSsmConfig({ tokenExpirationWindowSeconds: '100' }))

    await expect(import('@src/async-token/plugin-api/token-plugin-config')).rejects.toThrow(
      'tokenExpirationWindowSeconds is too short'
    )
  })

  it('throws when the pad is too large for the window', async () => {
    mockGetConfig.mockResolvedValue(
      buildSsmConfig({ tokenExpirationPadSeconds: '250', tokenExpirationWindowSeconds: '300' })
    )

    await expect(import('@src/async-token/plugin-api/token-plugin-config')).rejects.toThrow(
      'tokenExpirationPadSeconds too large'
    )
  })

  it('throws when usable lifetime is shorter than the window', async () => {
    mockGetConfig.mockResolvedValue(
      buildSsmConfig({ tokenExpirationWindowSeconds: '300', tokenMaxAllowedLifetimeSeconds: '500' })
    )

    await expect(import('@src/async-token/plugin-api/token-plugin-config')).rejects.toThrow(
      'token life time duration is too short'
    )
  })

  it('throws when max lifetime equals the window', async () => {
    mockGetConfig.mockResolvedValue(
      buildSsmConfig({ tokenExpirationWindowSeconds: '300', tokenMaxAllowedLifetimeSeconds: '300' })
    )

    await expect(import('@src/async-token/plugin-api/token-plugin-config')).rejects.toThrow(
      'token life time duration is too short'
    )
  })
})
