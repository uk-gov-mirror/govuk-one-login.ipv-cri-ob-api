import type { ConfigProvider } from '@common/client/config-provider'

import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { requireEnv } from '@common/util/env'
import { logger } from '@govuk-one-login/cri-logger'
import { z } from 'zod'

const configProvider: ConfigProvider = ssmConfigProvider

// We expect to be called every minute
const SCHEDULER_FREQUENCY = 60

const tokenPluginSsmSchema = z.object({
  enabledProfiles: z
    .string()
    .transform((val) => val.split('|'))
    .pipe(z.array(z.string().min(1)).nonempty()),
  tokenExpirationPadSeconds: z.coerce.number().int().positive(),
  tokenExpirationWindowSeconds: z.coerce.number().int().positive(),
  tokenMaxAllowedLifetimeSeconds: z.coerce.number().int().positive()
})

export interface ThirdPartyTokenPluginConfig {
  enabledProfiles: string[]
  pluginName: string
  // A padding value to prevent a token expiring during use across multiple endpoint calls
  tokenExpirationPadSeconds: number
  // The value at which the saved token become eligible for replacement
  tokenExpirationWindowSeconds: number
  // The duration for which we want the DynamoDB item stored,
  // must be equal or lower than the remote API's configured expiry
  // or for OAuth tokens <= expires_in
  tokenMaxAllowedLifetimeSeconds: number
}

export const createThirdPartyTokenPluginConfig = async (): Promise<ThirdPartyTokenPluginConfig> => {
  const pluginName = requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')
  const configRoot = requireEnv('THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT')

  const configPath = `${configRoot}/${pluginName}/config`
  const ssmConfig = tokenPluginSsmSchema.parse(await configProvider.getConfig(configPath))

  // DynamoDB auto ttl deletion is the best effort (upto 48hrs later...)
  // Token Item ttl expiration enforced CRI side (vs dynamo filter expression)
  // as there will be only ever be one token (per strategy)
  const tokenMaxAllowedLifetimeSeconds = ssmConfig.tokenMaxAllowedLifetimeSeconds
  const tokenExpirationWindowSeconds = ssmConfig.tokenExpirationWindowSeconds
  const tokenExpirationPadSeconds = ssmConfig.tokenExpirationPadSeconds

  // Deliberately not using structured log keys here so the whole config reads at a glance on one line
  logger.info(
    `Token Config - pluginName=${pluginName} tokenMaxAllowedLifetimeSeconds=${tokenMaxAllowedLifetimeSeconds} tokenExpirationWindowSeconds=${tokenExpirationWindowSeconds} tokenExpirationPadSeconds=${tokenExpirationPadSeconds}`
  )

  // tokenExpirationWindowSeconds is the lead time before expiry during which the token becomes eligible for replacement.
  // It must span at least two scheduler runs (2 x SCHEDULER_FREQUENCY) so at least one
  // replacement attempt is guaranteed to land inside the window before the token expires.
  if (tokenExpirationWindowSeconds < 2 * SCHEDULER_FREQUENCY) {
    throw new Error(
      `Invalid token config: tokenExpirationWindowSeconds is too short - ${tokenExpirationWindowSeconds}`
    )
  }

  // The pad is the end-of-life buffer during which consumers stop serving the token so an
  // in-flight journey cannot outlive it (size it to the expected journey length). It must sit
  // inside the replacement window and still leave at least one scheduler interval of overlap,
  // so a replacement attempt runs before consumers stop serving: pad <= window - SCHEDULER_FREQUENCY.
  if (tokenExpirationPadSeconds > tokenExpirationWindowSeconds - SCHEDULER_FREQUENCY) {
    throw new Error(`Invalid token config: tokenExpirationPadSeconds too large`)
  }

  // Usable lifetime = how long a new token serves before it becomes eligible for replacement.
  // Prevents churn where the token is replaced almost as soon as it is issued.
  // Currently relative (requires lifetime >= 2x window); intended absolute floor (usable >= MIN_USABLE_LIFETIME_SECONDS).
  const lifeTimeDuration = tokenMaxAllowedLifetimeSeconds - tokenExpirationWindowSeconds
  if (lifeTimeDuration < tokenExpirationWindowSeconds) {
    throw new Error(
      `Invalid token config: token life time duration is too short ${lifeTimeDuration})`
    )
  }

  return {
    enabledProfiles: ssmConfig.enabledProfiles,
    pluginName,
    tokenExpirationPadSeconds,
    tokenExpirationWindowSeconds,
    tokenMaxAllowedLifetimeSeconds
  }
}

// This is designed so that any failures trigger an error and thus a canary rollback
export const thirdPartyTokenPluginConfig = await createThirdPartyTokenPluginConfig()
