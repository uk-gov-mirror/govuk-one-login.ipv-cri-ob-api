import type { BanksRequestConfig } from '@src/bank-list/client/ecospend-bank-list-provider'
import type { BanksEndpointProfile } from '@src/bank-list/model/bank-list'

import { getParameters } from '@aws-lambda-powertools/parameters/ssm'

const CACHE_MAX_AGE_SECONDS = 300

export const createGetBanksRequestConfigFromSsm = (parameterPathPrefix: string) => {
  return async (profile: BanksEndpointProfile): Promise<BanksRequestConfig> => {
    const parameterPath = `${parameterPathPrefix}/${profile}`

    const parameters = await getParameters(parameterPath, {
      decrypt: false,
      maxAge: CACHE_MAX_AGE_SECONDS,
      recursive: true
    })

    if (!parameters || Object.keys(parameters).length === 0) {
      throw new Error(`No banks request configuration found for ${profile}`)
    }

    const endpointUrl = parameters['endpoint-url']

    if (!endpointUrl) {
      throw new Error(`No banks endpoint configured for ${profile}`)
    }

    const customList = parameters['custom-list']

    return customList ? { endpointUrl, customList } : { endpointUrl }
  }
}
