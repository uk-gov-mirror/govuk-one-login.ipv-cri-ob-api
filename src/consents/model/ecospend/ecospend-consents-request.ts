export interface EcospendConsentsRequest {
  additional_params?: string // "foo=bar,baz=qux"
  bank_id: string
  permissions: typeof ECOSPEND_CONSENT_REQUEST_PERMISSIONS
  redirect_url: string
  user_info?: {
    name: string
    surname: string
  }
}

export const ECOSPEND_CONSENT_REQUEST_PERMISSIONS = [
  'Account',
  'Balance',
  'Transactions',
  'DirectDebits',
  'StandingOrders',
  'Parties',
  'ScheduledPayments',
  // 'Statements', this doesn't work for mock bank
  'Offers'
] as const
