import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { requireEnv } from '@common/util/env'
import { logger } from '@govuk-one-login/cri-logger'
import { z } from 'zod'

const tokenPluginSSMSchema = z.object({
  enabledProfiles: z
    .string()
    .transform((val) => val.split('|'))
    .pipe(z.array(z.string().min(1)).nonempty()),
  maxAllowedLifetimeSeconds: z.coerce.number().positive(),
  tokenExpirationWindowSeconds: z.coerce.number().positive()
})

export interface ThirdPartyTokenPluginConfig {
  enabledProfiles: string[]
  expirationWindowSeconds: number
  itemTtlSeconds: number
  maxLifetimeSeconds: number
  pluginName: string
  tokenItemSuffix: string
}

export const createThirdPartyTokenPluginConfig = async (): Promise<ThirdPartyTokenPluginConfig> => {
  const pluginName = requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')
  const configRoot = requireEnv('THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT')

  const configPath = `${configRoot}/${pluginName}/config`
  const ssmConfig = tokenPluginSSMSchema.parse(await ssmConfigProvider.getConfig(configPath))

  // DynamoDB auto ttl deletion is the best effort (upto 48hrs later...)
  // Token Item ttl expiration enforced CRI side (vs dynamo filter expression)
  // as there will be only ever be one token (per strategy)
  const maxLifetimeSeconds = ssmConfig.maxAllowedLifetimeSeconds
  const expirationWindowSeconds = ssmConfig.tokenExpirationWindowSeconds

  // e.g 900 = 1200-300
  const itemTtlSeconds = maxLifetimeSeconds - expirationWindowSeconds

  logger.info(
    `Token Config - pluginName=${pluginName} maxAllowedLifetimeSeconds=${maxLifetimeSeconds} tokenExpirationWindowSeconds=${expirationWindowSeconds} itemTtlSeconds(calculated)=${itemTtlSeconds}`
  )

  if (itemTtlSeconds < 300) {
    throw new Error(
      `Third party token expiry window not valid - itemTtlSeconds must be at least 300 (maxLifetimeSeconds=${maxLifetimeSeconds}, expirationWindowSeconds=${expirationWindowSeconds}, itemTtlSeconds=${itemTtlSeconds})`
    )
  }

  if (expirationWindowSeconds < 60) {
    throw new Error(
      `Third party token expiry window not valid - expirationWindowSeconds must be at least 60 (expirationWindowSeconds=${expirationWindowSeconds})`
    )
  }

  if (expirationWindowSeconds >= itemTtlSeconds) {
    throw new Error(
      `Third party token expiry window not valid - expirationWindowSeconds must be less than itemTtlSeconds (expirationWindowSeconds=${expirationWindowSeconds}, itemTtlSeconds=${itemTtlSeconds})`
    )
  }

  return {
    enabledProfiles: ssmConfig.enabledProfiles,
    expirationWindowSeconds,
    itemTtlSeconds,
    maxLifetimeSeconds,
    pluginName,
    tokenItemSuffix: `_token_${pluginName}`
  }
}

// This is designed so that any failures trigger an error and thus a canary rollback
export const thirdPartyTokenPluginConfig = await createThirdPartyTokenPluginConfig()
