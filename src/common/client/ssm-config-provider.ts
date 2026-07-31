import type { ConfigProvider } from './config-provider'

import { getParameters } from '@aws-lambda-powertools/parameters/ssm'

const CACHE_MAX_AGE_SECONDS = 300

export const ssmConfigProvider: ConfigProvider = {
  getConfig: async (parameterPath) => {
    const params = await getParameters(parameterPath, {
      decrypt: true,
      maxAge: CACHE_MAX_AGE_SECONDS,
      recursive: true
    })
    if (!params || Object.keys(params).length === 0) {
      throw new Error(`No parameters found at path: ${parameterPath}`)
    }
    return params
  }
}
