// Note: this could be moved out into common/model and renamed more generically ot EndpointProfile
export const BanksEndpointProfile = {
  LIVE: 'LIVE',
  STUB: 'STUB',
  UAT: 'UAT'
} as const

export type BanksEndpointProfile = (typeof BanksEndpointProfile)[keyof typeof BanksEndpointProfile]

export interface StoredBank {
  bankId: string
  friendlyName: string
  serviceStatus: boolean
}

export interface BankListEntity {
  profile: BanksEndpointProfile
  banks: StoredBank[]
  refreshedAt: number
}
