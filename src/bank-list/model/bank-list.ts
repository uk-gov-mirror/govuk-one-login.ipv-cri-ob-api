// Note: this could be moved out into common/model and renamed more generically EndpointProfile
export const BanksEndpointProfile = {
  LIVE: 'LIVE',
  STUB: 'STUB',
  UAT: 'UAT'
} as const

export interface BankListEntity {
  banks: StoredBank[]
  profile: BanksEndpointProfile
  refreshedAtSeconds: number
}

export type BanksEndpointProfile = (typeof BanksEndpointProfile)[keyof typeof BanksEndpointProfile]

export interface StoredBank {
  bankId: string
  friendlyName: string
  serviceStatus: boolean
}
