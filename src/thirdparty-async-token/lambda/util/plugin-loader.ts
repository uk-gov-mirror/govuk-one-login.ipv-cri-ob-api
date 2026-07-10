import type { ThirdPartyTokenPlugin } from '@src/thirdparty-async-token/plugin-api/token-plugin'

import { requireEnv } from '@lib-common/util/env'

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

  return cached
}
