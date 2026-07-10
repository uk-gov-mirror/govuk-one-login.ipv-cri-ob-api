import { requireEnv } from '@lib-common/util/env'

export const getThirdPartyTokenName = (tokenPrefix: string): string =>
  `${tokenPrefix}-token-${requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')}`
