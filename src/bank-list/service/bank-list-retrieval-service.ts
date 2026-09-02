import type { SessionRepository } from '@common/client/session-repository'
import type { BankListRepository } from '@src/bank-list/client/bank-list-repository'
import type { BankListRetrievalResponse } from '@src/bank-list/model/bank-list-retrieval-response'

import { SessionNotFoundError } from '@common/error/session-not-found-error'
import { getTokenProfileForClientId } from '@common/model/oauth-client-id'
import { logger } from '@govuk-one-login/cri-logger'

type BankListRetrievalService = (request: {
  sessionId: string
}) => Promise<BankListRetrievalResponse>

interface BankListRetrievalServiceCollaborators {
  bankListRepository: BankListRepository
  sessionRepository: SessionRepository
}

export const createBankListRetrievalService = (
  collaborators: BankListRetrievalServiceCollaborators
): BankListRetrievalService => {
  return async (request) => {
    const session = await collaborators.sessionRepository.findBySessionId(request.sessionId)
    if (!session) throw new SessionNotFoundError()
    logger.appendKeys({
      cri_session_id: session.sessionId,
      govuk_signin_journey_id: session.clientSessionId
    })
    logger.info('Session retrieved')

    const profile = getTokenProfileForClientId(session.clientId)
    logger.appendKeys({ profile })

    logger.info('Querying bank list')
    const bankList = await collaborators.bankListRepository.getList(profile)

    if (!bankList) {
      logger.warn('No bank list available')
    } else {
      logger.info('Returning bank list', {
        count: bankList.banks.length
      })
    }
    return {
      bankList
    }
  }
}
