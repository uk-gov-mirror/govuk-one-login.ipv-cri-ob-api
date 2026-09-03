// Note: this could be moved out into common/util and renamed more generically EndpointProfile

import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'

const knownProfiles = Object.values(BanksEndpointProfile) as BanksEndpointProfile[]

export const parseProfiles = (rawProfiles: string): BanksEndpointProfile[] => {
  const profiles = rawProfiles
    .split('|')
    .map((profile) => profile.trim())
    .filter(Boolean)

  if (profiles.length === 0) {
    throw new Error('BANK_LIST_PROFILES must contain at least one profile')
  }

  const invalidProfiles = profiles.filter(
    (profile) => !knownProfiles.includes(profile as BanksEndpointProfile)
  )

  if (invalidProfiles.length > 0) {
    throw new Error(`Unknown bank-list profile(s): ${invalidProfiles.join(', ')}`)
  }

  if (new Set(profiles).size !== profiles.length) {
    throw new Error('BANK_LIST_PROFILES must not contain duplicate profiles')
  }

  return profiles as BanksEndpointProfile[]
}
