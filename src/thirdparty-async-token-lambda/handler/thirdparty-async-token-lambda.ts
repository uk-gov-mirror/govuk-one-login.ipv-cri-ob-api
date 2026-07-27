import type { PluginInput } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin'
import type { ScheduledEvent } from 'aws-lambda'

import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { injectLambdaContext } from '@common/handler/middleware'
import { requireEnv } from '@common/util/env'
import { logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import { loadPlugin } from '@src/thirdparty-async-token-lambda/plugin-loader'
import {
  type TokenUpdateResult,
  tokenUpdateService
} from '@src/thirdparty-async-token-lambda/service/token-update-service'
import { thirdPartyTokenPluginConfig } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config'

import middy from '@middy/core'

// WARNING: pluginInput.config contains secrets (e.g. client-secret).
// NEVER log pluginInput, include config content in error messages, or pass full error objects to logger.
// Only error.message is safe to log.

const plugin = await loadPlugin()
const configRoot = requireEnv('THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT')
logger.appendKeys({ functionName: process.env['AWS_LAMBDA_FUNCTION_NAME'] ?? 'FunctionNameNotSet' })

const updateForProfile = async (
  pluginInput: PluginInput,
  tokenForceUpdate: boolean
): Promise<TokenUpdateResult> => {
  logger.appendKeys({ tokenPrefix: pluginInput.tokenPrefix })
  logger.info(`Updating token for ${pluginInput.tokenPrefix}`)

  const tokenUpdateResult = await tokenUpdateService.updateTokenIfNeeded(
    pluginInput,
    tokenForceUpdate
  )
  logger.info(
    `Third-party token update status ${tokenUpdateResult.updated} - ${tokenUpdateResult.message}`
  )

  return tokenUpdateResult
}

const retrieveConfigProfile = async (tokenPrefix: string) => {
  // SSM for now, App-config later
  const ssmConfigProfile = await ssmConfigProvider.getConfig(
    `${configRoot}/${thirdPartyTokenPluginConfig.pluginName}/profiles/${tokenPrefix}`
  )
  // Plugin parses its own config
  return plugin.parseConfigProfile(ssmConfigProfile)
}

// -- ALL profiles
const updateForAllEnabledProfiles = async (tokenForceUpdate: boolean): Promise<void> => {
  const enabledProfiles = thirdPartyTokenPluginConfig.enabledProfiles
  logger.info(`Updating all enabled profiles: ${enabledProfiles.join(', ')}`)

  const failures: string[] = []

  // Updates all profiles in parallel.
  // Individual failures are caught and logged — a single failing prefix
  // does not prevent the others from completing.
  await Promise.all(
    enabledProfiles.map(async (tokenPrefix) => {
      try {
        const config = await retrieveConfigProfile(tokenPrefix)
        await updateForProfile({ config, tokenPrefix }, tokenForceUpdate)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`Failed for token prefix: ${tokenPrefix} - ${message}`)
        failures.push(tokenPrefix)
      }
    })
  )

  if (failures.length > 0) {
    throw new Error(`Failed for token prefixes: ${failures.join(', ')}`)
  }
}

// -- Bootstrap --------------------------------------------------------------------
// On cold start (deployment), force-update all profiles to ensure tokens are fresh.
// Failures here must cause the Lambda invocation to fail, triggering canary rollback.
logger.info('Bootstrapping tokens')
await updateForAllEnabledProfiles(true)

// -- Handler ------------------------------------------------------------------
// Updates all enabled profiles in parallel on each scheduled invocation.
const lambdaHandler = async (_event: ScheduledEvent): Promise<void> => {
  await updateForAllEnabledProfiles(false)
}

export const handler = middy<ScheduledEvent, void>()
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .handler(lambdaHandler)
