import type { BanksEndpointProfile, StoredBank } from '../model/bank-list'

export interface BankListProvider {
  getBanks: (profile: BanksEndpointProfile) => Promise<StoredBank[]>
}
