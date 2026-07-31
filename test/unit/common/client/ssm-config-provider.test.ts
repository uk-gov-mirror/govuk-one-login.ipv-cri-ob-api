import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@aws-lambda-powertools/parameters/ssm', () => ({
  getParameters: vi.fn()
}))

import { getParameters } from '@aws-lambda-powertools/parameters/ssm'
import { ssmConfigProvider } from '@common/client/ssm-config-provider'

const mockGetParameters = vi.mocked(getParameters)

describe('ssmConfigProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns params when found', async () => {
    const params = { 'client-id': 'id123', 'client-secret': 'secret' } // pragma: allowlist secret
    mockGetParameters.mockResolvedValue(params)

    const result = await ssmConfigProvider.getConfig('/path/to/params')

    expect(result).toEqual(params)
    expect(mockGetParameters).toHaveBeenCalledWith('/path/to/params', {
      decrypt: true,
      maxAge: 300,
      recursive: true
    })
  })

  it('throws when params are empty', async () => {
    mockGetParameters.mockResolvedValue({})

    await expect(ssmConfigProvider.getConfig('/empty/path')).rejects.toThrow(
      'No parameters found at path'
    )
  })

  it('throws when params are undefined', async () => {
    mockGetParameters.mockResolvedValue(undefined)

    await expect(ssmConfigProvider.getConfig('/null/path')).rejects.toThrow(
      'No parameters found at path'
    )
  })
})
