import type { ThirdPartyTokenPlugin } from '@src/async-token/plugin-api/token-plugin'

import { requireEnv } from '@common/util/env'
import { logger } from '@govuk-one-login/cri-logger'

interface PluginModule {
  createPlugin: () => ThirdPartyTokenPlugin
}

let cached: ThirdPartyTokenPlugin | undefined

export const loadPlugin = async (): Promise<ThirdPartyTokenPlugin> => {
  if (cached) return cached

  const pluginName = requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')
  const modulePath = `/opt/nodejs/${pluginName}.mjs`

  const mod = (await import(modulePath)) as PluginModule
  cached = mod.createPlugin()

  if (cached.name !== pluginName) {
    throw new Error(`Plugin name mismatch: expected "${pluginName}", got "${cached.name}"`)
  }

  logger.info('Loaded plugin', { pluginName: cached.name })

  return cached
}
