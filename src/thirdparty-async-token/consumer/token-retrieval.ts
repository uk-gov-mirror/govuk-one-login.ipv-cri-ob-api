import type { ConfigProfileName } from '@lib-common/util/client-config-profile-resolver'

import { logger } from '@govuk-one-login/cri-logger'
import {
  formatThirdPartyTokenExpiryDateTime,
  isThirdPartyTokenExpired
} from '@src/thirdparty-async-token/common'
import { thirdPartyTokenRepository } from '@src/thirdparty-async-token/common/client/token-repository'
import { getThirdPartyTokenName } from '@src/thirdparty-async-token/common/util/token-naming'

export const retrieveTokenForConfigProfileName = async (configProfileName: ConfigProfileName) => {
  const tokenName = getThirdPartyTokenName(configProfileName)

  logger.info(`Checking table for existing cached token named ${tokenName}`)
  const tokenEntity = await thirdPartyTokenRepository.getToken(tokenName)

  const existingCachedToken = tokenEntity !== undefined

  // Uses isThirdPartyTokenExpired (30s pad) rather than isThirdPartyTokenNearExpiration because
  // consumers should use the token until the last safe moment
  const tokenTtlHasExpired = existingCachedToken && isThirdPartyTokenExpired(tokenEntity)

  logger.info(
    `ProfileName ${configProfileName} - existing cached token: ${existingCachedToken}, ttl expired: ${tokenTtlHasExpired}`
  )

  if (!existingCachedToken) return undefined
  if (tokenTtlHasExpired) {
    const expiredDateTime = formatThirdPartyTokenExpiryDateTime(tokenEntity.ttl)

    logger.warn(`Cannot use current token ${tokenName} as it has expired ${expiredDateTime}`)

    return undefined
  }

  return tokenEntity.tokenValue
}
