import type { ConfigProfileName } from '@common/util/client-config-profile-resolver'
import type { ThirdPartyTokenRepository } from '@src/thirdparty-async-token-common'
import type { ThirdPartyTokenPluginConfig } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'

import { logger } from '@govuk-one-login/cri-logger'
import {
  formatThirdPartyTokenExpiryDateTime,
  getThirdPartyTokenName,
  isThirdPartyTokenExpired
} from '@src/thirdparty-async-token-common'

export interface ThirdPartyTokenRetrievalService {
  retrieveTokenForConfigProfileName: (
    configProfileName: ConfigProfileName
  ) => Promise<string | undefined>
}

export const createThirdPartyTokenRetrievalService = (
  repository: ThirdPartyTokenRepository,
  config: ThirdPartyTokenPluginConfig
): ThirdPartyTokenRetrievalService => ({
  retrieveTokenForConfigProfileName: async (configProfileName: ConfigProfileName) => {
    // Note "configProfileName" is prefixed to the token name
    const tokenName = getThirdPartyTokenName(configProfileName, config.tokenItemSuffix)

    logger.info(`Checking table for existing cached token named ${tokenName}`)
    const tokenEntity = await repository.getToken(tokenName)

    const existingCachedToken = !!tokenEntity

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
})
