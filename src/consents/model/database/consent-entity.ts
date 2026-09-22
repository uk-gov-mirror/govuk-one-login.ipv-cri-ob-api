import { type EcospendConsentsResponse } from '@src/consents/model/ecospend/ecospend-consents-response'

const BANK_CONSENT_URL_EXPIRY_SECONDS = 240
const CONSENT_TTL_SECONDS = 2 * 60 * 60

export interface ConsentEntity {
  bankConsentUrl: string
  bankConsentUrlExpirySeconds: number
  bankId: string
  consentId: string
  sessionId: string
  ttl: number
}

export const toConsentEntity = (
  ecospendConsent: EcospendConsentsResponse,
  sessionId: string
): ConsentEntity => {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    bankConsentUrl: ecospendConsent.bank_consent_url,
    bankConsentUrlExpirySeconds: nowSeconds + BANK_CONSENT_URL_EXPIRY_SECONDS,
    bankId: ecospendConsent.bank_id,
    consentId: ecospendConsent.id,
    sessionId,
    ttl: nowSeconds + CONSENT_TTL_SECONDS
  }
}
