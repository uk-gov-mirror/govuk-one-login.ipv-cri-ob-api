import type { PluginInput, ThirdPartyTokenPlugin } from '@src/async-token/plugin-api/token-plugin'

import { logger } from '@govuk-one-login/cri-logger'
import { isThirdPartyTokenExpired, type ThirdPartyTokenRepository } from '@src/async-token/common'
import {
  calculateItemTtl,
  formatThirdPartyTokenExpiryDateTime,
  isThirdPartyTokenNearExpiration
} from '@src/async-token/common'
import { thirdPartyTokenRepository } from '@src/async-token/common/client/token-repository'
import { getThirdPartyTokenName } from '@src/async-token/common/util/token-naming'
import { loadPlugin } from '@src/async-token/lambda/util/plugin-loader'
import {
  thirdPartyTokenPluginConfig,
  type ThirdPartyTokenPluginConfig
} from '@src/async-token/plugin-api/token-plugin-config'

export interface ThirdPartyTokenUpdateService {
  updateTokenIfNeeded: (
    pluginInput: PluginInput,
    tokenForceUpdate: boolean
  ) => Promise<TokenUpdateResult>
}
export interface TokenUpdateResult {
  message: string
  updated: boolean
}

interface NewTokenRequestResult {
  message: string
  tokenValue: string | undefined
}

const createThirdPartyTokenUpdateService = (
  plugin: ThirdPartyTokenPlugin,
  tokenRepository: ThirdPartyTokenRepository,
  pluginConfig: ThirdPartyTokenPluginConfig
): ThirdPartyTokenUpdateService => ({
  updateTokenIfNeeded: async (pluginInput, tokenForceUpdate) => {
    const { tokenPrefix } = pluginInput
    const tokenName = getThirdPartyTokenName(tokenPrefix)
    const token = await tokenRepository.getToken(tokenName)
    const hasExistingToken = token !== undefined
    const ttlExpiredOrNearExpiration =
      hasExistingToken &&
      isThirdPartyTokenNearExpiration(token, pluginConfig.tokenExpirationWindowSeconds)

    if (hasExistingToken && !ttlExpiredOrNearExpiration && !tokenForceUpdate) {
      return {
        message: `No update needed - hasExistingToken: ${hasExistingToken}, ttlExpiredOrNearExpiration: ${ttlExpiredOrNearExpiration}, tokenForceUpdate: ${tokenForceUpdate}`,
        updated: false
      }
    }

    // For visibility at runtime for the update trigger
    const reasons = [
      !hasExistingToken && 'noExistingToken',
      ttlExpiredOrNearExpiration && 'ttlExpiredOrNearExpiration',
      tokenForceUpdate && 'tokenForceUpdate'
    ]
      .filter(Boolean)
      .join(', ')
    logger.info('New token requested', { tokenPrefix, tokenName, reason: reasons })

    const result = await performNewTokenRequest(plugin, pluginInput, pluginConfig)

    if (result.tokenValue) {
      logger.info('Saving token to repository', { tokenPrefix, tokenName })
      const ttl = calculateItemTtl(pluginConfig.tokenMaxAllowedLifetimeSeconds)
      await tokenRepository.putToken({
        id: tokenName,
        tokenValue: result.tokenValue,
        pad: pluginConfig.tokenExpirationPadSeconds,
        ttl
      })
      return { message: `${result.message}, Token ${tokenName} Saved`, updated: true }
    }

    // TODO Token request failed +1 count + alarm after X failed updates configured based on expiry window
    let errorMessage = `Failed to retrieve new token - ${result.message}`

    // This enables an earlier fail and avoids consumers
    // continuing to use a known expired token
    // with a third party call failing on use later
    if (token && isThirdPartyTokenExpired(token)) {
      const expiredDateTime = formatThirdPartyTokenExpiryDateTime(token.ttl)
      errorMessage = `${errorMessage} and removed current token for ${tokenName} as it expired - ${expiredDateTime}`
      await tokenRepository.clearToken(tokenName)
    }

    return { message: errorMessage, updated: false }
  }
})

const performNewTokenRequest = async (
  tokenPlugin: ThirdPartyTokenPlugin,
  pluginInput: PluginInput,
  pluginConfig: ThirdPartyTokenPluginConfig
): Promise<NewTokenRequestResult> => {
  // Try/Catch used to guarantee no throw
  try {
    const requestConfig = tokenPlugin.buildTokenRequest(pluginInput)

    const response = await fetch(requestConfig.endpointUrl, {
      body: requestConfig.body,
      headers: requestConfig.headers,
      method: 'POST',
      signal: AbortSignal.timeout(requestConfig.timeoutMs)
    })

    // One AbortSignal timeout covers the whole request (connect + body).
    const responseBody = await response.text()

    // The token request responded but with an unexpected status code
    // TODO METRIC
    if (response.status !== 200) {
      if (tokenPlugin.alertStatusCodes.includes(response.status)) {
        logger.warn('Non-200 from token endpoint, alert metric triggered', {
          statusCode: response.status,
          tokenPrefix: pluginInput.tokenPrefix
        })
      }

      // Token update failed - don't clear existing token
      return {
        message: `Token endpoint returned non-200 statuscode - ${response.status}`,
        tokenValue: undefined
      }
    }

    // Mapper failure TODO METRIC - API RES Invalid
    const tokenResponse = tokenPlugin.mapResponse(
      responseBody,
      pluginConfig.tokenMaxAllowedLifetimeSeconds
    )
    if (!tokenResponse) {
      return { message: 'Token response mapping failed', tokenValue: undefined }
    }

    // Validate the actual token value - this is up to the plugin (not all tokens values are JWT's)
    // TODO METRIC - API RES Invalid (different cause, log separately)
    if (!tokenPlugin.isTokenValid(tokenResponse)) {
      return { message: 'Retrieved token failed validation', tokenValue: undefined }
    }

    return { message: 'new token successfully retrieved', tokenValue: tokenResponse.tokenValue }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      message: `Error during token request - ${message}`,
      tokenValue: undefined
    }
  }
}

export const tokenUpdateService = createThirdPartyTokenUpdateService(
  await loadPlugin(),
  thirdPartyTokenRepository,
  thirdPartyTokenPluginConfig
)
