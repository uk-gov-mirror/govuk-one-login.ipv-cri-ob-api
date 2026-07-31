import { getConfigProfileNameFromClientId } from '@common/util/client-config-profile-resolver'
import { describe, expect, it } from 'vitest'

describe('getConfigProfileNameFromClientId', () => {
  it.each([
    ['ipv-core-stub', 'STUB'],
    ['ipv-core-stub-aws-build', 'STUB'],
    ['ipv-core-stub-aws-prod', 'STUB'],
    ['ipv-core-3rd-party-stubs', 'STUB'],
    ['ipv-core-stub-aws-build_3rdparty', 'UAT'],
    ['ipv-core-stub-aws-prod_3rdparty', 'UAT'],
    ['ipv-core-stub-pre-prod-aws-build', 'LIVE'],
    ['ipv-core', 'LIVE']
  ])('%s maps to %s', (clientId, expected) => {
    const result = getConfigProfileNameFromClientId(clientId)
    expect(typeof result).toBe('string')
    expect(result).toBe(expected)
  })

  it('throws for an unknown clientId', () => {
    expect(() => getConfigProfileNameFromClientId('unknown-client')).toThrow(
      'Unknown clientId: unknown-client'
    )
  })

  it('returns the profile string from the mapping without restricting to known profile values', () => {
    const result = getConfigProfileNameFromClientId('some-client', {
      'some-client': 'CUSTOM_PROFILE'
    })
    expect(typeof result).toBe('string')
    expect(result).toBe('CUSTOM_PROFILE')
  })
})
