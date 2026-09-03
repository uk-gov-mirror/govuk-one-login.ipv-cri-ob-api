import type { BankListEntity } from '@src/bank-list/model/bank-list'

export interface BankListRetrievalResponse {
  bankList: BankListEntity | undefined
}
