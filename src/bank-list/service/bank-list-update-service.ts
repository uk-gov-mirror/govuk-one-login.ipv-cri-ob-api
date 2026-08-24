import type { BankListProvider } from '../client/bank-list-provider'
import type { BankListRepository } from '../client/bank-list-repository'
import type { BanksEndpointProfile } from '../model/bank-list'

export interface BankListUpdateResponse {
  updated: boolean
}

interface BankListUpdateCollaborators {
  bankListProvider: BankListProvider
  bankListRepository: BankListRepository
}

interface BankListUpdateConfig {
  refreshAfterSeconds: number
}

export type BankListUpdateService = (
  profile: BanksEndpointProfile
) => Promise<BankListUpdateResponse>

export const createBankListUpdateService = (
  collaborators: BankListUpdateCollaborators,
  config: BankListUpdateConfig
): BankListUpdateService => {
  return async (profile) => {
    const existingList = await collaborators.bankListRepository.getList(profile)
    const nowSeconds = Math.floor(Date.now() / 1000)

    if (existingList) {
      const ageSeconds = nowSeconds - existingList.refreshedAt

      if (ageSeconds < config.refreshAfterSeconds) {
        return { updated: false }
      }
    }

    const banks = await collaborators.bankListProvider.getBanks(profile)

    // Note: open question on if an empty list is a valid response to be saved or if we should reject this

    await collaborators.bankListRepository.replaceList({
      profile,
      banks,
      refreshedAt: nowSeconds
    })

    return { updated: true }
  }
}
