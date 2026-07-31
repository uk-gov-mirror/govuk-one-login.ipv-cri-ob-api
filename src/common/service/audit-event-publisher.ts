import type { SessionItem } from '@govuk-one-login/cri-types'

import { AuditEvents } from '@common/model/audit-events'
import { requireEnv } from '@common/util/env'
import { buildAndSendAuditEvent } from '@govuk-one-login/cri-audit'

export interface AuditEventPublisher {
  publishJourneyEnd: (event: JourneyEndEvent) => Promise<void>
  publishVCIssued: (event: CredentialIssuedEvent) => Promise<void>
}

export interface AuditEventPublisherConfig {
  componentId: string
  queueUrl: string
}

export interface CredentialIssuedEvent {
  session: SessionItem
}

export interface JourneyEndEvent {
  session: SessionItem
}

export const createAuditEventPublisher = (
  config: AuditEventPublisherConfig
): AuditEventPublisher => ({
  publishJourneyEnd: (event) =>
    buildAndSendAuditEvent(config.queueUrl, AuditEvents.END, config.componentId, event.session),
  publishVCIssued: (event) =>
    buildAndSendAuditEvent(
      config.queueUrl,
      AuditEvents.VC_ISSUED,
      config.componentId,
      event.session
    )
})

export const auditEventPublisher: AuditEventPublisher = createAuditEventPublisher({
  componentId: requireEnv('AUDIT_COMPONENT_ID'),
  queueUrl: requireEnv('AUDIT_QUEUE_URL')
})
