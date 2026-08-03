import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetToken, mockIsExpired } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
  mockIsExpired: vi.fn()
}))

vi.mock('@src/async-token/common', () => ({
  formatThirdPartyTokenExpiryDateTime: (ttl: number) => new Date(ttl * 1000).toISOString(),
  isThirdPartyTokenExpired: mockIsExpired
}))

vi.mock('@src/async-token/common/client/token-repository', () => ({
  thirdPartyTokenRepository: { getToken: mockGetToken }
}))

vi.mock('@src/async-token/common/util/token-naming', () => ({
  getThirdPartyTokenName: (prefix: string) => `${prefix}-token-ob-token-plugin`
}))

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() }
}))

import { retrieveToken } from '@src/async-token/consumer/token-retrieval'

describe('retrieveToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns token value when token exists and is not expired', async () => {
    mockGetToken.mockResolvedValue({
      id: 'STUB-token-ob-token-plugin',
      tokenValue: 'my-token',
      ttl: 9_999_999_999 // far future
    })
    mockIsExpired.mockReturnValue(false)

    const result = await retrieveToken('STUB')

    expect(mockGetToken).toHaveBeenCalledWith('STUB-token-ob-token-plugin')
    expect(result).toBe('my-token')
  })

  it('returns undefined when token exists but is expired', async () => {
    mockGetToken.mockResolvedValue({
      id: 'STUB-token-ob-token-plugin',
      tokenValue: 'my-token',
      ttl: 100
    })
    mockIsExpired.mockReturnValue(true)

    const result = await retrieveToken('STUB')

    expect(result).toBeUndefined()
  })

  it('returns undefined when no token found', async () => {
    mockGetToken.mockResolvedValue(undefined)

    const result = await retrieveToken('STUB')

    expect(result).toBeUndefined()
  })
})
