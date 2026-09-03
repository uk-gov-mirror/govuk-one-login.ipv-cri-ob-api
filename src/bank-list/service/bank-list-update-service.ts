import type { BankListRepository } from '@src/bank-list/client/bank-list-repository'
import type { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import type { BankListProvider } from '@src/bank-list/model/bank-list-provider'

export interface BankListUpdateResponse {
  updated: boolean
}

export type BankListUpdateService = (
  profile: BanksEndpointProfile
) => Promise<BankListUpdateResponse>

interface BankListUpdateCollaborators {
  bankListProvider: BankListProvider
  bankListRepository: BankListRepository
}

interface BankListUpdateConfig {
  refreshAfterSeconds: number
}

export const createBankListUpdateService = (
  collaborators: BankListUpdateCollaborators,
  config: BankListUpdateConfig
): BankListUpdateService => {
  return async (profile) => {
    const existingList = await collaborators.bankListRepository.getList(profile)
    const nowSeconds = Math.floor(Date.now() / 1000)

    if (existingList) {
      const ageSeconds = nowSeconds - existingList.refreshedAtSeconds
      if (ageSeconds < config.refreshAfterSeconds) {
        return { updated: false }
      }
    }

    const banks = await collaborators.bankListProvider.getBanks(profile)

    // Note: open question on if an empty list is a valid response to be saved or if we should reject this

    await collaborators.bankListRepository.replaceList({
      profile,
      banks,
      refreshedAtSeconds: nowSeconds
    })

    return { updated: true }
  }
}
