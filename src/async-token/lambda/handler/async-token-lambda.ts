import type { ConfigProvider } from '@common/client/config-provider'
import type { PluginInput } from '@src/async-token/plugin-api/token-plugin'
import type { ScheduledEvent } from 'aws-lambda'

import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { requireEnv } from '@common/util/env'
import { injectLambdaContext, logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import {
  type TokenUpdateResult,
  tokenUpdateService
} from '@src/async-token/lambda/service/token-update-service'
import { loadPlugin } from '@src/async-token/lambda/util/plugin-loader'
import { thirdPartyTokenPluginConfig } from '@src/async-token/plugin-api/token-plugin-config'

import middy from '@middy/core'

const configProvider: ConfigProvider = ssmConfigProvider
const plugin = await loadPlugin()
const configRoot = requireEnv('THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT')
logger.appendKeys({ functionName: process.env['AWS_LAMBDA_FUNCTION_NAME'] ?? 'FunctionNameNotSet' })

// On cold start (deployment), force-update all profiles to ensure tokens are fresh.
// Failures here must cause the Lambda invocation to fail, triggering canary rollback.
logger.info('Bootstrapping tokens')
await updateForAllEnabledProfiles(true)

// Updates all enabled profiles in parallel on each scheduled invocation.
const lambdaHandler = async (_event: ScheduledEvent): Promise<void> => {
  await updateForAllEnabledProfiles(false)
}

export const handler = middy<ScheduledEvent, void>()
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .handler(lambdaHandler)

async function retrieveConfigProfile(tokenPrefix: string) {
  // SSM for now, App-config later
  const ssmConfigProfile = await configProvider.getConfig(
    `${configRoot}/${thirdPartyTokenPluginConfig.pluginName}/profiles/${tokenPrefix}`
  )
  return plugin.parseConfigProfile(ssmConfigProfile)
}

// Updates all profiles in parallel.
// Individual failures are caught and logged — a single failing prefix
// does not prevent the others from completing.
async function updateForAllEnabledProfiles(tokenForceUpdate: boolean): Promise<void> {
  const enabledProfiles = thirdPartyTokenPluginConfig.enabledProfiles
  logger.info('Updating all enabled profiles', { enabledProfiles })

  const failures: string[] = []

  await Promise.all(
    enabledProfiles.map(async (tokenPrefix) => {
      try {
        const config = await retrieveConfigProfile(tokenPrefix)
        await updateForProfile({ config, tokenPrefix }, tokenForceUpdate)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        logger.error('Failed to update token for profile', { errorMessage: message, tokenPrefix })
        failures.push(tokenPrefix)
      }
    })
  )

  if (failures.length > 0) {
    throw new Error(`Failed for token prefixes: ${failures.join(', ')}`)
  }
}

async function updateForProfile(
  pluginInput: PluginInput,
  tokenForceUpdate: boolean
): Promise<TokenUpdateResult> {
  logger.info('Updating token for profile', { tokenPrefix: pluginInput.tokenPrefix })

  const tokenUpdateResult = await tokenUpdateService.updateTokenIfNeeded(
    pluginInput,
    tokenForceUpdate
  )
  logger.info('Token update completed', {
    tokenPrefix: pluginInput.tokenPrefix,
    tokenUpdateResult
  })

  return tokenUpdateResult
}
