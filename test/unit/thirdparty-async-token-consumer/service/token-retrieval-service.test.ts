import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIsExpired } = vi.hoisted(() => ({
  mockIsExpired: vi.fn()
}))

vi.mock('@src/thirdparty-async-token-common', () => ({
  formatThirdPartyTokenExpiryDateTime: (ttl: number) => new Date(ttl * 1000).toISOString(),
  getThirdPartyTokenName: (prefix: string, suffix: string) => `${prefix}${suffix}`,
  isThirdPartyTokenExpired: mockIsExpired
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() }
}))

import type { ThirdPartyTokenRepository } from '@src/thirdparty-async-token-common/client/token-repository'
import type { ThirdPartyTokenPluginConfig } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'

import { createThirdPartyTokenRetrievalService } from '@src/thirdparty-async-token-consumer/service/token-retrieval-service'

describe('createThirdPartyTokenRetrievalService', () => {
  const mockRepository: ThirdPartyTokenRepository = {
    clearToken: vi.fn(),
    getToken: vi.fn(),
    putToken: vi.fn()
  }

  const config: ThirdPartyTokenPluginConfig = {
    enabledProfiles: ['STUB'],
    expirationWindowSeconds: 300,
    itemTtlSeconds: 3300,
    maxLifetimeSeconds: 3600,
    pluginName: 'ob_token_plugin',
    tokenItemSuffix: '_suffix'
  }

  const service = createThirdPartyTokenRetrievalService(mockRepository, config)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns token when valid and not expired', async () => {
    const entity = { id: 'STUB_suffix', tokenValue: 'my-token', ttl: 9999999999 }
    vi.mocked(mockRepository.getToken).mockResolvedValue(entity)
    mockIsExpired.mockReturnValue(false)

    const result = await service.retrieveTokenForConfigProfileName('STUB')

    expect(mockRepository.getToken).toHaveBeenCalledWith('STUB_suffix')
    expect(result).toBe('my-token')
  })

  it('returns undefined when token is expired', async () => {
    const entity = { id: 'STUB_suffix', tokenValue: 'my-token', ttl: 100 }
    vi.mocked(mockRepository.getToken).mockResolvedValue(entity)
    mockIsExpired.mockReturnValue(true)

    const result = await service.retrieveTokenForConfigProfileName('STUB')

    expect(result).toBeUndefined()
  })

  it('returns undefined when token not found', async () => {
    vi.mocked(mockRepository.getToken).mockResolvedValue(undefined)

    const result = await service.retrieveTokenForConfigProfileName('STUB')

    expect(result).toBeUndefined()
  })
})
