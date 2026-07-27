import type { ThirdPartyTokenRepository } from '@src/thirdparty-async-token-common'
import type {
  PluginInput,
  ThirdPartyTokenPlugin
} from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin'

import { logger } from '@govuk-one-login/cri-logger'
import {
  formatThirdPartyTokenExpiryDateTime,
  getThirdPartyTokenName,
  isThirdPartyTokenNearExpiration
} from '@src/thirdparty-async-token-common'
import { thirdPartyTokenRepository } from '@src/thirdparty-async-token-common/client/token-repository'
import { loadPlugin } from '@src/thirdparty-async-token-lambda/plugin-loader'
import {
  thirdPartyTokenPluginConfig,
  type ThirdPartyTokenPluginConfig
} from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'

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
    const tokenName = getThirdPartyTokenName(pluginInput.tokenPrefix, pluginConfig.tokenItemSuffix)
    const existingToken = await tokenRepository.getToken(tokenName)
    const ttlExpired =
      existingToken !== undefined &&
      isThirdPartyTokenNearExpiration(existingToken, pluginConfig.expirationWindowSeconds)

    if (existingToken && !ttlExpired && !tokenForceUpdate) {
      return {
        message: `No update needed - existingToken: ${!!existingToken}, ttlExpired: ${ttlExpired}, tokenForceUpdate: ${tokenForceUpdate}`,
        updated: false
      }
    }

    // For visibility at runtime for the update trigger
    const reasons = [
      !existingToken && 'noExistingToken',
      ttlExpired && 'ttlExpired',
      tokenForceUpdate && 'tokenForceUpdate'
    ]
      .filter(Boolean)
      .join(', ')
    logger.info(`New ${tokenName} token requested - reason: ${reasons}`)

    const result = await performNewTokenRequest(plugin, pluginInput)

    if (result.tokenValue) {
      logger.info(`Saving Token ${tokenName} to ThirdPartyTokenRepository`)
      const ttl = Math.floor(Date.now() / 1000) + pluginConfig.itemTtlSeconds
      await tokenRepository.putToken({ id: tokenName, tokenValue: result.tokenValue, ttl })
      return { message: `${result.message}, Token ${tokenName} Saved`, updated: true }
    }

    // TODO Token request failed +1 count + alarm after X failed updates configured based on expiry window
    let errorMessage = `Failed to retrieve new token - ${result.message}`

    // This enables an earlier fail and avoids consumers
    // continuing to use a known expired token
    // with a third party call failing on use later
    if (ttlExpired && existingToken) {
      const expiredDateTime = formatThirdPartyTokenExpiryDateTime(existingToken.ttl)
      errorMessage = `${errorMessage} and removed current token for ${tokenName} as it expired - ${expiredDateTime}`
      await tokenRepository.clearToken(tokenName)
    }

    return { message: errorMessage, updated: false }
  }
})

const performNewTokenRequest = async (
  tokenPlugin: ThirdPartyTokenPlugin,
  pluginInput: PluginInput
): Promise<NewTokenRequestResult> => {
  const requestConfig = tokenPlugin.buildTokenRequest(pluginInput)

  return fetch(requestConfig.endpointUrl, {
    body: requestConfig.body,
    headers: requestConfig.headers,
    method: 'POST',
    signal: AbortSignal.timeout(requestConfig.timeoutMs)
  })
    .then(async (response) => {
      // AbortSignal only covers until headers arrive — body read needs its own timeout
      const responseBody = await Promise.race([
        response.text(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Response body read timed out')),
            requestConfig.timeoutMs
          )
        )
      ])

      // The token request responded but with an unexpected status code
      // TODO METRIC
      if (response.status !== 200) {
        if (tokenPlugin.alertStatusCodes.includes(response.status)) {
          logger.warn(`Status code ${response.status}, triggered alert metric`)
        }

        // Token update failed - don't clear existing token
        return {
          message: `Token endpoint returned non-200 statuscode - ${response.status}`,
          tokenValue: undefined
        }
      }

      // Mapper failure TODO METRIC - API RES Invalid
      const tokenResponse = tokenPlugin.mapResponse(responseBody)
      if (!tokenResponse) {
        return { message: 'Token response mapping failed', tokenValue: undefined }
      }

      // Validate the actual token value - this is up to the plugin (not all tokens values are JWT's)
      // TODO METRIC - API RES Invalid (different cause, log separately)
      if (!tokenPlugin.isTokenValid(tokenResponse)) {
        return { message: 'Retrieved token failed validation', tokenValue: undefined }
      }

      return { message: 'new token successfully retrieved', tokenValue: tokenResponse.tokenValue }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        message: `Unexpected error during token request - ${message}`,
        tokenValue: undefined
      }
    })
}

export const tokenUpdateService = createThirdPartyTokenUpdateService(
  await loadPlugin(),
  thirdPartyTokenRepository,
  thirdPartyTokenPluginConfig
)
