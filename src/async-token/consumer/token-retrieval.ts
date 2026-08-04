import type { ConfigProfileName } from '@common/util/client-config-profile-resolver'

import { logger } from '@govuk-one-login/cri-logger'
import {
  formatThirdPartyTokenExpiryDateTime,
  isThirdPartyTokenExpired
} from '@src/async-token/common'
import { thirdPartyTokenRepository } from '@src/async-token/common/client/token-repository'
import { getThirdPartyTokenName } from '@src/async-token/common/util/token-naming'

type RetrievalStatus = 'EXPIRED' | 'NOT_FOUND' | 'RETRIEVED'

const resolveRetrievalStatus = (hasToken: boolean, expired: boolean): RetrievalStatus => {
  if (!hasToken) return 'NOT_FOUND'
  if (expired) return 'EXPIRED'
  return 'RETRIEVED'
}

export const retrieveToken = async (configProfileName: ConfigProfileName) => {
  const tokenName = getThirdPartyTokenName(configProfileName)

  logger.info('Checking table for existing cached token', { tokenName })
  const tokenEntity = await thirdPartyTokenRepository.getToken(tokenName)

  const existingCachedToken = tokenEntity !== undefined

  // isThirdPartyTokenExpired treats the token as expired only within entity.pad of its ttl
  // This avoids returning token that will expire during a journey. We serve it through the window,
  // up to the last safe moment defined by the pad
  const tokenTtlHasExpired = existingCachedToken && isThirdPartyTokenExpired(tokenEntity)

  const retrievalStatus = resolveRetrievalStatus(existingCachedToken, tokenTtlHasExpired)

  logger.info('Token retrieval result', { configProfileName, retrievalStatus })

  if (!existingCachedToken) return undefined
  if (tokenTtlHasExpired) {
    const expiredDateTime = formatThirdPartyTokenExpiryDateTime(tokenEntity.ttl)

    logger.warn('Cannot use current token as it has expired', { tokenName, expiredDateTime })

    return undefined
  }

  return tokenEntity.tokenValue
}
