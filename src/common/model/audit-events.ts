import { requireEnv } from '@common/util/env'

const PREFIX = requireEnv('AUDIT_EVENT_NAME_PREFIX')

export const AuditEvents = {
  END: `${PREFIX}_END`,
  REDIRECT: `${PREFIX}_REDIRECT`,
  REQUEST_SENT: `${PREFIX}_REQUEST_SENT`,
  RESPONSE_RECEIVED: `${PREFIX}_RESPONSE_RECEIVED`,
  START: `${PREFIX}_START`,
  VC_ISSUED: `${PREFIX}_VC_ISSUED`,
  WEBHOOK_RECEIVED: `${PREFIX}_WEBHOOK_RECEIVED`
} as const

export type AuditEventName = (typeof AuditEvents)[keyof typeof AuditEvents]
