import type { EndpointProfile } from '@common/model/endpoint-profile'
import type { EcospendConsentsResponse } from '@src/consents/model/ecospend/ecospend-consents-response'

export interface ConsentsProvider {
  createConsent: (request: CreateConsentRequest) => Promise<EcospendConsentsResponse>
}

export interface CreateConsentRequest {
  accessToken: string
  bankId: string
  endpointUrl: string
  profile: EndpointProfile
  returnUrl: string
}
