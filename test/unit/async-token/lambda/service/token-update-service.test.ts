import type { ThirdPartyTokenEntity } from '@src/async-token/common/types/token-entity'
import type {
  PluginInput,
  ThirdPartyTokenRequestConfig
} from '@src/async-token/plugin-api/token-plugin'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClearToken, mockGetToken, mockIsNearExpiration, mockPlugin, mockPutToken } = vi.hoisted(
  () => ({
    mockClearToken: vi.fn(),
    mockGetToken: vi.fn(),
    mockIsNearExpiration: vi.fn(),
    mockPlugin: {
      alertStatusCodes: [401, 403],
      buildTokenRequest: vi.fn(),
      isTokenValid: vi.fn(),
      mapResponse: vi.fn(),
      name: 'ob-token-plugin',
      parseConfigProfile: vi.fn()
    },
    mockPutToken: vi.fn()
  })
)

vi.mock('@src/async-token/common', () => ({
  formatThirdPartyTokenExpiryDateTime: (ttl: number) => new Date(ttl * 1000).toISOString(),
  isThirdPartyTokenNearExpiration: mockIsNearExpiration
}))

vi.mock('@src/async-token/common/util/token-naming', () => ({
  getThirdPartyTokenName: (prefix: string) => `${prefix}_suffix`
}))

vi.mock('@src/async-token/common/client/token-repository', () => ({
  thirdPartyTokenRepository: {
    clearToken: mockClearToken,
    getToken: mockGetToken,
    putToken: mockPutToken
  }
}))

vi.mock('@src/async-token/lambda/util/plugin-loader', () => ({
  loadPlugin: () => Promise.resolve(mockPlugin)
}))

vi.mock('@src/async-token/plugin-api/token-plugin-config', () => ({
  thirdPartyTokenPluginConfig: {
    enabledProfiles: ['strategy'],
    expirationWindowSeconds: 300,
    itemTtlSeconds: 3300,
    maxLifetimeSeconds: 3600,
    pluginName: 'ob-token-plugin'
  }
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

import { tokenUpdateService } from '@src/async-token/lambda/service/token-update-service'

const buildTokenRequestConfig = (
  overrides?: Partial<ThirdPartyTokenRequestConfig>
): ThirdPartyTokenRequestConfig => ({
  body: 'grant_type=client_credentials',
  endpointUrl: 'https://example.com/token',
  headers: {},
  timeoutMs: 10_000,
  ...overrides
})

const buildFetchResponse = (overrides?: { body?: string; status?: number }): Response =>
  ({
    status: overrides?.status ?? 200,
    text: () => Promise.resolve(overrides?.body ?? '{"access_token":"jwt"}')
  }) as unknown as Response

const buildPluginInput = (overrides?: Partial<PluginInput>): PluginInput => ({
  config: {
    'client-id': 'id',
    'client-secret': 'secret', // pragma: allowlist secret
    'endpoint-url': 'https://example.com/token',
    'grant-type': 'client_credentials',
    scope: 'accounts'
  },
  tokenPrefix: 'strategy',
  ...overrides
})

const buildTokenEntity = (overrides?: Partial<ThirdPartyTokenEntity>): ThirdPartyTokenEntity => ({
  id: 'strategy_suffix',
  tokenValue: 'tok',
  ttl: 9_999_999_999, // far future
  ...overrides
})

const setupNoExistingTokenWithRequest = () => {
  mockGetToken.mockResolvedValue(undefined)
  mockPlugin.buildTokenRequest.mockReturnValue(buildTokenRequestConfig())
}

describe('tokenUpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('skips update when token exists, is not near expiration, and force is false', async () => {
    mockGetToken.mockResolvedValue(buildTokenEntity())
    mockIsNearExpiration.mockReturnValue(false)

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches and stores new token when no existing token found', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse())
    mockPlugin.mapResponse.mockReturnValue({ tokenValue: 'jwt' })
    mockPlugin.isTokenValid.mockReturnValue(true)

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(true)
    expect(mockPutToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'strategy_suffix', tokenValue: 'jwt' })
    )
  })

  it('fetches and stores new token when token exists but force update is true', async () => {
    mockGetToken.mockResolvedValue(buildTokenEntity({ tokenValue: 'old-tok' }))
    mockIsNearExpiration.mockReturnValue(false)
    mockPlugin.buildTokenRequest.mockReturnValue(buildTokenRequestConfig())
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: '{"access_token":"new-jwt"}' }))
    mockPlugin.mapResponse.mockReturnValue({ tokenValue: 'new-jwt' })
    mockPlugin.isTokenValid.mockReturnValue(true)

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), true)

    expect(result.updated).toBe(true)
    expect(mockPutToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'strategy_suffix', tokenValue: 'new-jwt' })
    )
  })

  it('does not clear token on non-200 response when no existing token', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: '', status: 500 }))

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(mockClearToken).not.toHaveBeenCalled()
  })

  it('clears existing token on non-200 response when ttl has expired', async () => {
    mockGetToken.mockResolvedValue(buildTokenEntity({ ttl: 100 }))
    mockIsNearExpiration.mockReturnValue(true)
    mockPlugin.buildTokenRequest.mockReturnValue(buildTokenRequestConfig())
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: '', status: 500 }))

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(mockClearToken).toHaveBeenCalledWith('strategy_suffix')
  })

  it('reports alert status code in message on 401 response with no existing token', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: 'Unauthorized', status: 401 }))

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Token endpoint returned non-200 statuscode - 401')
  })

  it('returns failure when 200 response body fails plugin mapResponse parsing', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: 'invalid' }))
    mockPlugin.mapResponse.mockReturnValue(undefined)

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Token response mapping failed')
  })

  it('returns failure when 200 response maps successfully but fails plugin isTokenValid', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue(buildFetchResponse({ body: '{"access_token":"bad"}' }))
    mockPlugin.mapResponse.mockReturnValue({ tokenValue: 'bad' })
    mockPlugin.isTokenValid.mockReturnValue(false)

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Retrieved token failed validation')
  })

  it('returns failure when fetch throws a network error', async () => {
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockRejectedValue(new Error('Network timeout'))

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Error during token request')
    expect(result.message).toContain('Network timeout')
  })

  it('returns failure when buildTokenRequest throws', async () => {
    mockGetToken.mockResolvedValue(undefined)
    mockPlugin.buildTokenRequest.mockImplementation(() => {
      throw new Error('Invalid config')
    })

    const result = await tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Error during token request')
    expect(result.message).toContain('Invalid config')
  })

  it('returns failure when 200 response body read times out', async () => {
    vi.useFakeTimers()
    setupNoExistingTokenWithRequest()
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      text: () =>
        new Promise(() => {
          /* never resolves */
        })
    } as unknown as Response)

    const resultPromise = tokenUpdateService.updateTokenIfNeeded(buildPluginInput(), false)
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise

    expect(result.updated).toBe(false)
    expect(result.message).toContain('Response body read timed out')
  })
})
