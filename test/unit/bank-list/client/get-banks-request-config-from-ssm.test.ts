import { getParameters } from '@aws-lambda-powertools/parameters/ssm'
import { createGetBanksRequestConfigFromSsm } from '@src/bank-list/client/get-banks-request-config-from-ssm'
import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@aws-lambda-powertools/parameters/ssm', () => ({ getParameters: vi.fn() }))

const PARAMETER_PREFIX = '/test/bank-list'
const getBanksRequestConfig = createGetBanksRequestConfigFromSsm(PARAMETER_PREFIX)

beforeEach(() => vi.clearAllMocks())

describe('createGetBanksRequestConfigFromSsm', () => {
  it('retrieves configuration for the requested profile', async () => {
    vi.mocked(getParameters).mockResolvedValue({ 'endpoint-url': 'https://provider.test/banks' })

    await getBanksRequestConfig(BanksEndpointProfile.STUB)

    expect(getParameters).toHaveBeenCalledWith(`${PARAMETER_PREFIX}/STUB`, {
      decrypt: false,
      maxAge: 300,
      recursive: true
    })
  })

  it('returns an endpoint without a custom list', async () => {
    vi.mocked(getParameters).mockResolvedValue({ 'endpoint-url': 'https://provider.test/banks' })

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).resolves.toEqual({
      endpointUrl: 'https://provider.test/banks'
    })
  })

  it('returns an optional custom list', async () => {
    vi.mocked(getParameters).mockResolvedValue({
      'endpoint-url': 'https://provider.test/banks',
      'custom-list': 'all-offline-test-banks'
    })

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).resolves.toEqual({
      endpointUrl: 'https://provider.test/banks',
      customList: 'all-offline-test-banks'
    })
  })

  it('throws when parameter store returns no result', async () => {
    vi.mocked(getParameters).mockResolvedValue(undefined)

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).rejects.toThrow(
      'No banks request configuration found for STUB'
    )
  })

  it('throws when no profile parameters exist', async () => {
    vi.mocked(getParameters).mockResolvedValue({})

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).rejects.toThrow(
      'No banks request configuration found for STUB'
    )
  })

  it('throws when endpoint-url is missing', async () => {
    vi.mocked(getParameters).mockResolvedValue({ 'custom-list': 'test-banks' })

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).rejects.toThrow(
      'No banks endpoint configured for STUB'
    )
  })

  it('propagates Parameter Store failures', async () => {
    vi.mocked(getParameters).mockRejectedValue(new Error('SSM unavailable'))

    await expect(getBanksRequestConfig(BanksEndpointProfile.STUB)).rejects.toThrow(
      'SSM unavailable'
    )
  })
})
