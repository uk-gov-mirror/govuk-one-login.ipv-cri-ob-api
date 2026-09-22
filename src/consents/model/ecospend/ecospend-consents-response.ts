import { z } from 'zod'

export const EcospendConsentStatus = {
  INITIAL: 'Initial',
  AWAITING_AUTHORISATION: 'AwaitingAuthorization',
  AUTHORISED: 'Authorised',
  CANCELLED: 'Canceled',
  FAILED: 'Failed',
  ABANDONED: 'Abandoned',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
  REVOCATION_PENDING: 'RevocationPending',
  REJECTED: 'Rejected'
} as const

export type EcospendConsentStatus =
  (typeof EcospendConsentStatus)[keyof typeof EcospendConsentStatus]

export const ecospendConsentsResponseSchema = z.object({
  bank_consent_url: z.url({ protocol: /^https?$/ }),
  bank_id: z.string().min(1),
  bank_reference_id: z.string().min(1),
  consent_end_date: z.string().min(1),
  consent_expiry_date: z.string().min(1),
  id: z.string().min(1),
  redirect_url: z.string().min(1),
  status: z.enum(EcospendConsentStatus)
})

export type EcospendConsentsResponse = z.infer<typeof ecospendConsentsResponseSchema>
