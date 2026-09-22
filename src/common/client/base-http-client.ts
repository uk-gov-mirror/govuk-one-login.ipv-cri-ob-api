import type { EndpointProfile } from '@common/model/endpoint-profile'

import { instrumentedFetch } from '@common/util/instrumented-fetch'

export interface BaseHttpClient {
  postJson: (request: PostJsonRequest) => Promise<unknown>
}

interface BaseHttpClientConfig {
  endpoint: string
}

interface PostJsonRequest {
  accessToken: string
  body: unknown
  profile: EndpointProfile
  url: string
}

export const createBaseHttpClient = (config: BaseHttpClientConfig): BaseHttpClient => ({
  postJson: async (request) => {
    const response = await instrumentedFetch(
      request.url,
      {
        body: JSON.stringify(request.body),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${request.accessToken}`,
          'content-type': 'application/json',
          'accept-language': '',
          'accept-encoding': ''
        },
        method: 'POST'
      },
      { endpoint: config.endpoint, profile: request.profile }
    )

    if (!response.ok) {
      throw new Error(`${config.endpoint} request returned ${response.status}`)
    }

    return await response.json()
  }
})
