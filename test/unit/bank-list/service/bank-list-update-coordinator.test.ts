import type { BankListUpdateService } from '@src/bank-list/service/bank-list-update-service'
import type { MockInstance } from 'vitest'

import { logger } from '@govuk-one-login/cri-logger'
import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import { createBankListUpdateCoordinator } from '@src/bank-list/service/bank-list-update-coordinator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('bank-list-update-coordinator', () => {
  let updateBankList: BankListUpdateService
  let infoSpy: MockInstance<typeof logger.info>
  let errorSpy: MockInstance<typeof logger.error>

  beforeEach(() => {
    updateBankList = vi.fn().mockResolvedValue({ updated: false })

    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createCoordinator = (profiles: readonly BanksEndpointProfile[]) =>
    createBankListUpdateCoordinator(
      {
        updateBankList
      },
      {
        profiles
      }
    )

  it('updates every enabled profile', async () => {
    const coordinator = createCoordinator([
      BanksEndpointProfile.STUB,
      BanksEndpointProfile.UAT,
      BanksEndpointProfile.LIVE
    ])

    await coordinator.updateAll()

    expect(updateBankList).toHaveBeenCalledTimes(3)
    expect(updateBankList).toHaveBeenNthCalledWith(1, BanksEndpointProfile.STUB)
    expect(updateBankList).toHaveBeenNthCalledWith(2, BanksEndpointProfile.UAT)
    expect(updateBankList).toHaveBeenNthCalledWith(3, BanksEndpointProfile.LIVE)
  })

  it('logs the outcome of update checks', async () => {
    vi.mocked(updateBankList)
      .mockResolvedValueOnce({ updated: true })
      .mockResolvedValueOnce({ updated: false })

    const coordinator = createCoordinator([BanksEndpointProfile.STUB, BanksEndpointProfile.UAT])

    await coordinator.updateAll()

    expect(infoSpy).toHaveBeenCalledWith('Bank list update completed', {
      profile: BanksEndpointProfile.STUB,
      updated: true
    })
    expect(infoSpy).toHaveBeenCalledWith('Bank list update completed', {
      profile: BanksEndpointProfile.UAT,
      updated: false
    })
  })

  it('completes successful updates and throws after attempting all profiles when any update fails', async () => {
    vi.mocked(updateBankList)
      .mockRejectedValueOnce(new Error('STUB unavailable'))
      .mockResolvedValueOnce({ updated: true })

    const coordinator = createCoordinator([BanksEndpointProfile.STUB, BanksEndpointProfile.UAT])

    await expect(coordinator.updateAll()).rejects.toThrow('Bank list update(s) failed for: STUB')

    expect(updateBankList).toHaveBeenCalledTimes(2)
    expect(updateBankList).toHaveBeenNthCalledWith(1, BanksEndpointProfile.STUB)
    expect(updateBankList).toHaveBeenNthCalledWith(2, BanksEndpointProfile.UAT)

    expect(errorSpy).toHaveBeenCalledWith('Bank list update failed', {
      profile: BanksEndpointProfile.STUB,
      reason: 'STUB unavailable'
    })
    expect(infoSpy).toHaveBeenCalledWith('Bank list update completed', {
      profile: BanksEndpointProfile.UAT,
      updated: true
    })
  })

  it('throws when every enabled profile fails', async () => {
    vi.mocked(updateBankList)
      .mockRejectedValueOnce(new Error('STUB unavailable'))
      .mockRejectedValueOnce(new Error('UAT unavailable'))

    const coordinator = createCoordinator([BanksEndpointProfile.STUB, BanksEndpointProfile.UAT])

    await expect(coordinator.updateAll()).rejects.toThrow(
      'Bank list update(s) failed for: STUB, UAT'
    )
    expect(updateBankList).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })
})
