import type { BaseHttpClient } from '@common/client/base-http-client'
import type { ConsentsProvider } from '@src/consents/model/consents-provider'

import {
  ECOSPEND_CONSENT_REQUEST_PERMISSIONS,
  type EcospendConsentsRequest
} from '@src/consents/model/ecospend/ecospend-consents-request'
import { ecospendConsentsResponseSchema } from '@src/consents/model/ecospend/ecospend-consents-response'
import { z } from 'zod'

interface EcospendConsentsClientCollaborators {
  httpClient: BaseHttpClient
}

export const createEcospendConsentsProvider = (
  collaborators: EcospendConsentsClientCollaborators
): ConsentsProvider => ({
  createConsent: async (request) => {
    const ecospendRequest: EcospendConsentsRequest = {
      bank_id: request.bankId,
      permissions: ECOSPEND_CONSENT_REQUEST_PERMISSIONS,
      redirect_url: request.returnUrl
    }

    const responseBody = await collaborators.httpClient.postJson({
      accessToken: request.accessToken,
      body: ecospendRequest,
      profile: request.profile,
      url: request.endpointUrl
    })

    const consentsResponse = ecospendConsentsResponseSchema.safeParse(responseBody)
    if (!consentsResponse.success) {
      throw new Error(`Unexpected consents response: ${z.prettifyError(consentsResponse.error)}`)
    }

    return consentsResponse.data
  }
})
