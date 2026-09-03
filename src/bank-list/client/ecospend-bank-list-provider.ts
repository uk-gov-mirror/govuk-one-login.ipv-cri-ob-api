import type { BankListProvider } from '@src/bank-list/model/bank-list-provider'

import { BanksEndpointProfile } from '@src/bank-list/model/bank-list'
import { ecospendBankListResponseSchema } from '@src/bank-list/model/ecospend-banks-response'
import { getErrorMessage } from '@src/bank-list/util/get-error-message'

const FETCH_TIMEOUT_MS = 10_000

export interface BanksRequestConfig {
  customList?: string
  endpointUrl: string
}

interface EcospendBankListProviderCollaborators {
  getBanksRequestConfig: (profile: BanksEndpointProfile) => Promise<BanksRequestConfig>
  retrieveAccessToken: (profile: BanksEndpointProfile) => Promise<string | undefined>
}

export const createEcospendBankListProvider = (
  collaborators: EcospendBankListProviderCollaborators
): BankListProvider => ({
  getBanks: async (profile) => {
    const token = await collaborators.retrieveAccessToken(profile)

    if (!token) {
      throw new Error(`No token is available for ${profile}`)
    }

    const requestConfig = await collaborators.getBanksRequestConfig(profile)
    const url = new URL(requestConfig.endpointUrl)

    url.searchParams.set('is_sandbox', String(profile !== BanksEndpointProfile.LIVE))
    // Note: there's still an open question on if there are other acceptable divisions e.g. Private
    url.searchParams.set('division', 'Personal')
    url.searchParams.set('standard', 'OBIE')
    url.searchParams.set('country_iso_code', 'GB')
    url.searchParams.set('fetchAllBanks', 'true')

    if (requestConfig.customList !== undefined) {
      url.searchParams.set('custom_list', requestConfig.customList)
    }

    const request = new Request(url, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        // DO NOT REMOVE
        // Ecospend returns HTTP 500 for the default header values added by fetch
        'accept-language': '',
        'accept-encoding': ''
      },
      method: 'GET',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })

    const response = await fetch(request).catch((error: unknown) => {
      throw new Error(`Banks request failed for ${profile}: '${getErrorMessage(error)}'`)
    })

    if (response.status !== 200) {
      throw new Error(`Banks request returned ${response.status} for ${profile}`)
    }

    const responseBody: unknown = await response.json().catch((error: unknown) => {
      throw new Error(
        `Banks response for ${profile} was not valid JSON: '${getErrorMessage(error)}'`
      )
    })

    const parsedResponse = ecospendBankListResponseSchema.safeParse(responseBody)

    if (!parsedResponse.success) {
      throw new Error(`Unexpected banks response for ${profile}: '${parsedResponse.error.message}'`)
    }

    const { data, meta } = parsedResponse.data

    if (meta.total_count !== data.length) {
      throw new Error(
        `Banks response for ${profile} reported ${meta.total_count} banks but returned ${data.length}`
      )
    }

    return data
  }
})
