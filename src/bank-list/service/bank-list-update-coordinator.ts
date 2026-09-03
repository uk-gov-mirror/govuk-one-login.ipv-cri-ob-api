import type { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import type { BankListUpdateService } from '@src/bank-list/service/bank-list-update-service'

import { logger } from '@govuk-one-login/cri-logger'
import { getErrorMessage } from '@src/bank-list/util/get-error-message'

interface BankListUpdateCoordinatorCollaborators {
  updateBankList: BankListUpdateService
}

interface BankListUpdateCoordinatorConfig {
  profiles: readonly BanksEndpointProfile[]
}

interface BankListUpdateCoordinatorFailure {
  profile: BanksEndpointProfile
  reason: string
}

export const createBankListUpdateCoordinator = (
  collaborators: BankListUpdateCoordinatorCollaborators,
  config: BankListUpdateCoordinatorConfig
) => ({
  updateAll: async (): Promise<void> => {
    const enabledProfiles = config.profiles
    const results = await Promise.allSettled(
      enabledProfiles.map((profile) => collaborators.updateBankList(profile))
    )

    const failures: BankListUpdateCoordinatorFailure[] = []

    results.forEach((result, index) => {
      const profile = config.profiles[index]!

      if (result.status === 'rejected') {
        const reason = getErrorMessage(result.reason)

        logger.error('Bank list update failed', { profile, reason })
        failures.push({ profile, reason })

        return
      }

      logger.info('Bank list update completed', {
        profile,
        updated: result.value.updated
      })
    })

    if (failures.length > 0) {
      const failedProfiles = failures.map(({ profile }) => profile).join(', ')

      throw new Error(`Bank list update(s) failed for: ${failedProfiles}`)
    }
  }
})
