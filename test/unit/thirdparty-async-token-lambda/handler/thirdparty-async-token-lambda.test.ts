import type { ThirdPartyTokenPluginConfig } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'
import type { ScheduledEvent } from 'aws-lambda'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAppendKeys,
  mockError,
  mockGetConfig,
  mockInfo,
  mockParseConfigProfile,
  mockUpdateTokenIfNeeded
} = vi.hoisted(() => ({
  mockAppendKeys: vi.fn(),
  mockError: vi.fn(),
  mockGetConfig: vi.fn(),
  mockInfo: vi.fn(),
  mockParseConfigProfile: vi.fn().mockImplementation((c: Record<string, string>) => c),
  mockUpdateTokenIfNeeded: vi.fn().mockResolvedValue({ message: 'ok', updated: true })
}))

vi.mock('@common/client/ssm-config-provider', () => ({
  ssmConfigProvider: { getConfig: mockGetConfig }
}))

vi.mock('@common/handler/middleware', () => ({
  injectLambdaContext: () => ({ after: vi.fn(), before: vi.fn() })
}))

vi.mock('@common/util/env', () => ({
  requireEnv: () => '/ssm/root'
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { appendKeys: mockAppendKeys, error: mockError, info: mockInfo }
}))

vi.mock('@govuk-one-login/cri-metrics', () => ({
  logMetrics: () => ({ after: vi.fn(), before: vi.fn() }),
  metrics: {}
}))

vi.mock('@src/thirdparty-async-token-lambda/service/token-update-service', () => ({
  tokenUpdateService: { updateTokenIfNeeded: mockUpdateTokenIfNeeded }
}))

vi.mock('@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config', () => ({
  thirdPartyTokenPluginConfig: buildPluginConfig()
}))

vi.mock('@src/thirdparty-async-token-lambda/plugin-loader', () => ({
  loadPlugin: () =>
    Promise.resolve({
      alertStatusCodes: [401, 403],
      buildTokenRequest: vi.fn(),
      isTokenValid: vi.fn(),
      mapResponse: vi.fn(),
      name: 'ob_token_plugin',
      parseConfigProfile: mockParseConfigProfile
    })
}))

vi.mock('@middy/core', () => ({
  default: () => ({
    handler: vi.fn().mockImplementation((fn: unknown) => fn),
    use: vi.fn().mockReturnThis()
  })
}))

const buildScheduledEvent = (): ScheduledEvent => ({}) as ScheduledEvent

const buildPluginConfig = (
  overrides?: Partial<ThirdPartyTokenPluginConfig>
): ThirdPartyTokenPluginConfig => ({
  enabledProfiles: ['STUB', 'UAT'],
  expirationWindowSeconds: 300,
  itemTtlSeconds: 3300,
  maxLifetimeSeconds: 3600,
  pluginName: 'ob_token_plugin',
  tokenItemSuffix: '_token_ob_token_plugin',
  ...overrides
})

const buildSsmConfig = () => ({
  'client-id': 'id',
  'client-secret': 'secret', // pragma: allowlist secret
  'endpoint-url': 'https://example.com/token',
  'grant-type': 'client_credentials',
  scope: 'accounts'
})

describe('thirdparty-async-token-lambda handler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('cold start bootstrap', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.clearAllMocks()
      mockGetConfig.mockResolvedValue(buildSsmConfig())
      mockUpdateTokenIfNeeded.mockResolvedValue({ message: 'ok', updated: true })
    })

    it('appends functionName from AWS_LAMBDA_FUNCTION_NAME env var to logger keys on init', async () => {
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'my-function')
      await import('@src/thirdparty-async-token-lambda/handler/thirdparty-async-token-lambda')
      expect(mockAppendKeys).toHaveBeenCalledWith({ functionName: 'my-function' })
    })

    it('appends FunctionNameNotSet when AWS_LAMBDA_FUNCTION_NAME is not set', async () => {
      delete process.env['AWS_LAMBDA_FUNCTION_NAME']
      await import('@src/thirdparty-async-token-lambda/handler/thirdparty-async-token-lambda')
      expect(mockAppendKeys).toHaveBeenCalledWith({ functionName: 'FunctionNameNotSet' })
    })

    it('calls updateTokenIfNeeded with tokenForceUpdate:true for each enabled profile on module load', async () => {
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'fn')
      await import('@src/thirdparty-async-token-lambda/handler/thirdparty-async-token-lambda')

      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledTimes(2)
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ tokenPrefix: 'STUB' }),
        true
      )
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ tokenPrefix: 'UAT' }),
        true
      )
    })

    it('throws on bootstrap if updateTokenIfNeeded fails — triggering canary rollback', async () => {
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'fn')
      mockUpdateTokenIfNeeded.mockRejectedValue(new Error('SSM unavailable'))

      await expect(
        import('@src/thirdparty-async-token-lambda/handler/thirdparty-async-token-lambda')
      ).rejects.toThrow('Failed for token prefixes')
    })
  })

  describe('scheduled handler', () => {
    let handler: (event: ScheduledEvent) => Promise<void>

    beforeEach(async () => {
      vi.resetModules()
      vi.clearAllMocks()
      vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', 'fn')
      mockGetConfig.mockResolvedValue(buildSsmConfig())
      mockUpdateTokenIfNeeded.mockResolvedValue({ message: 'ok', updated: true })

      // Import triggers bootstrap (updateTokenIfNeeded with force:true for each profile)
      const mod =
        await import('@src/thirdparty-async-token-lambda/handler/thirdparty-async-token-lambda')
      handler = mod.handler as unknown as (event: ScheduledEvent) => Promise<void>

      // Clear bootstrap call counts and re-set mocks so assertions only reflect the handler invocation
      vi.clearAllMocks()
      mockGetConfig.mockResolvedValue(buildSsmConfig())
      mockUpdateTokenIfNeeded.mockResolvedValue({ message: 'ok', updated: true })
    })

    it('calls updateTokenIfNeeded with tokenForceUpdate:false for each enabled profile', async () => {
      await handler(buildScheduledEvent())

      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledTimes(2)
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ tokenPrefix: 'STUB' }),
        false
      )
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ tokenPrefix: 'UAT' }),
        false
      )
    })

    it('fetches SSM config from correct path for each profile', async () => {
      await handler(buildScheduledEvent())

      expect(mockGetConfig).toHaveBeenCalledWith('/ssm/root/ob_token_plugin/profiles/STUB')
      expect(mockGetConfig).toHaveBeenCalledWith('/ssm/root/ob_token_plugin/profiles/UAT')
    })

    it('parses SSM config via plugin.parseConfigProfile before passing to updateTokenIfNeeded', async () => {
      const parsedConfig = { parsed: 'true' }
      mockParseConfigProfile.mockReturnValue(parsedConfig)

      await handler(buildScheduledEvent())

      expect(mockParseConfigProfile).toHaveBeenCalledWith(buildSsmConfig())
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ config: parsedConfig }),
        false
      )
    })

    it('continues processing remaining profiles when one profile update throws', async () => {
      mockUpdateTokenIfNeeded
        .mockRejectedValueOnce(new Error('profile error'))
        .mockResolvedValueOnce({ message: 'ok', updated: true })

      await expect(handler(buildScheduledEvent())).rejects.toThrow('Failed for token prefixes')
      expect(mockUpdateTokenIfNeeded).toHaveBeenCalledTimes(2)
    })

    it('throws aggregated error naming all failed prefixes when all profiles fail', async () => {
      mockUpdateTokenIfNeeded.mockRejectedValue(new Error('fail'))

      await expect(handler(buildScheduledEvent())).rejects.toThrow(
        'Failed for token prefixes: STUB, UAT'
      )
    })

    it('throws aggregated error when SSM fetch fails for a profile', async () => {
      mockGetConfig.mockRejectedValue(new Error('SSM unavailable'))

      await expect(handler(buildScheduledEvent())).rejects.toThrow('Failed for token prefixes')
    })
  })
})
