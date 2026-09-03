import type { SessionRepository } from '@common/client/session-repository'
import type { SessionItem } from '@govuk-one-login/cri-types'
import type { BankListRepository } from '@src/bank-list/client/bank-list-repository'
import type { BankListEntity } from '@src/bank-list/model/bank-list'
import type { MockInstance } from 'vitest'

import { SessionNotFoundError } from '@common/error/session-not-found-error'
import { OAuthClientId } from '@common/model/oauth-client-id'
import { logger } from '@govuk-one-login/cri-logger'
import { TokenProfile } from '@lib/token-rotator/model/token-profile'
import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import { createBankListRetrievalService } from '@src/bank-list/service/bank-list-retrieval-service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const buildBankListEntity = (overrides: Partial<BankListEntity> = {}): BankListEntity => ({
  banks: [
    {
      bankId: 'iron-bank',
      friendlyName: 'Iron Bank',
      serviceStatus: true
    }
  ],
  profile: BanksEndpointProfile.STUB,
  refreshedAtSeconds: 1_800_000_000,
  ...overrides
})

const buildSession = (overrides: Partial<SessionItem> = {}): SessionItem =>
  ({
    clientId: OAuthClientId.IPV_CORE_STUB,
    clientSessionId: 'client-session-1',
    sessionId: 'session-123',
    ...overrides
  }) as SessionItem

describe('bank-list-retrieval-service', () => {
  let bankListRepository: BankListRepository
  let sessionRepository: SessionRepository
  let infoSpy: MockInstance<typeof logger.info>
  let warnSpy: MockInstance<typeof logger.warn>
  let appendKeysSpy: MockInstance<typeof logger.appendKeys>

  beforeEach(() => {
    bankListRepository = {
      getList: vi.fn(),
      replaceList: vi.fn()
    }

    sessionRepository = {
      findByAccessToken: vi.fn(),
      findBySessionId: vi.fn()
    }

    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    appendKeysSpy = vi.spyOn(logger, 'appendKeys').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws SessionNotFoundError when the session is missing', async () => {
    vi.mocked(sessionRepository.findBySessionId).mockResolvedValue(undefined)

    const service = createBankListRetrievalService({
      bankListRepository,
      sessionRepository
    })

    await expect(service({ sessionId: 'session-123' })).rejects.toBeInstanceOf(SessionNotFoundError)

    expect(bankListRepository.getList).not.toHaveBeenCalled()
  })

  it('queries bank list repo using the profile mapped from the client id', async () => {
    vi.mocked(sessionRepository.findBySessionId).mockResolvedValue(buildSession())
    vi.mocked(bankListRepository.getList).mockResolvedValue(undefined)

    const service = createBankListRetrievalService({
      bankListRepository,
      sessionRepository
    })

    await service({ sessionId: 'session-123' })

    expect(sessionRepository.findBySessionId).toHaveBeenCalledWith('session-123')
    expect(bankListRepository.getList).toHaveBeenCalledWith(TokenProfile.STUB)
  })

  it('returns the stored bank list', async () => {
    const entity = buildBankListEntity()

    vi.mocked(sessionRepository.findBySessionId).mockResolvedValue(buildSession())
    vi.mocked(bankListRepository.getList).mockResolvedValue(entity)

    const service = createBankListRetrievalService({
      bankListRepository,
      sessionRepository
    })

    await expect(service({ sessionId: 'session-123' })).resolves.toEqual({
      bankList: entity
    })

    expect(appendKeysSpy).toHaveBeenCalledWith({
      cri_session_id: 'session-123',
      govuk_signin_journey_id: 'client-session-1'
    })
    expect(appendKeysSpy).toHaveBeenCalledWith({ profile: TokenProfile.STUB })
    expect(infoSpy).toHaveBeenCalledWith('Session retrieved')
    expect(infoSpy).toHaveBeenCalledWith('Querying bank list')
    expect(infoSpy).toHaveBeenCalledWith('Returning bank list', {
      count: entity.banks.length
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('returns an undefined bank list when the cache is empty', async () => {
    vi.mocked(sessionRepository.findBySessionId).mockResolvedValue(buildSession())
    vi.mocked(bankListRepository.getList).mockResolvedValue(undefined)

    const service = createBankListRetrievalService({
      bankListRepository,
      sessionRepository
    })

    await expect(service({ sessionId: 'session-123' })).resolves.toEqual({
      bankList: undefined
    })

    expect(warnSpy).toHaveBeenCalledWith('No bank list available')
    expect(infoSpy).not.toHaveBeenCalledWith('Returning bank list', expect.anything())
  })

  it('propagates bank list repo failures', async () => {
    vi.mocked(sessionRepository.findBySessionId).mockResolvedValue(buildSession())
    vi.mocked(bankListRepository.getList).mockRejectedValue(new Error('DynamoDB unavailable'))

    const service = createBankListRetrievalService({
      bankListRepository,
      sessionRepository
    })

    await expect(service({ sessionId: 'session-123' })).rejects.toThrow('DynamoDB unavailable')
  })
})
