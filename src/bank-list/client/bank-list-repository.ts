import type { BankListEntity, BanksEndpointProfile } from '@src/bank-list/model/bank-list'

export interface BankListRepository {
  getList: (profile: BanksEndpointProfile) => Promise<BankListEntity | undefined>
  replaceList: (entity: BankListEntity) => Promise<void>
}
