import type { ThirdPartyTokenPlugin } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin'

import { requireEnv } from '@common/util/env'

interface PluginModule {
  createPlugin: () => ThirdPartyTokenPlugin
}

let cached: ThirdPartyTokenPlugin | undefined

export const loadPlugin = async (): Promise<ThirdPartyTokenPlugin> => {
  if (cached) return cached

  // Plugin names use snake_case (e.g. ob_token_plugin) but layer filenames
  // must be kebab-case per code conventions (e.g. ob-token-plugin.mjs).
  // CloudFormation has no string transform functions, so we derive the path here.
  const pluginName = requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')
  const modulePath = `/opt/nodejs/${pluginName.replaceAll('_', '-')}.mjs`

  const mod = (await import(modulePath)) as PluginModule
  cached = mod.createPlugin()

  return cached
}
