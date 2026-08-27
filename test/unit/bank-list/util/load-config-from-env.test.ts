import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import { parseProfiles } from '@src/bank-list/util/load-config-from-env'
import { describe, expect, it } from 'vitest'

describe('parseProfiles', () => {
  it('parses configured profiles', () => {
    expect(parseProfiles(' STUB | UAT ')).toEqual([
      BanksEndpointProfile.STUB,
      BanksEndpointProfile.UAT
    ])
  })

  it('rejects an empty profile list', () => {
    expect(() => parseProfiles(' | ')).toThrow(
      'BANK_LIST_PROFILES must contain at least one profile'
    )
  })

  it('rejects unknown profiles', () => {
    expect(() => parseProfiles('STUB|UNKNOWN')).toThrow('Unknown bank-list profile(s): UNKNOWN')
  })

  it('rejects duplicate profiles', () => {
    expect(() => parseProfiles('UAT|UAT')).toThrow(
      'BANK_LIST_PROFILES must not contain duplicate profiles'
    )
  })
})
