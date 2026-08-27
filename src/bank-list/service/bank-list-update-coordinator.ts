import type { BanksEndpointProfile } from '../model/bank-list'
import type { BankListUpdateService } from './bank-list-update-service'

import { getErrorMessage } from '../util/get-error-message'
import { logger } from '@govuk-one-login/cri-logger'

interface BankListUpdateCoordinatorConfig {
  profiles: readonly BanksEndpointProfile[]
}

interface BankListUpdateCoordinatorFailure {
  profile: BanksEndpointProfile
  reason: string
}

interface BankListUpdateCoordinatorCollaborators {
  updateBankList: BankListUpdateService
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
