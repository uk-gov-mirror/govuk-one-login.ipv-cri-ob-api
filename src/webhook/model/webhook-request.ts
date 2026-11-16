import { z } from 'zod'

const jsonBodySchema = z.string().transform((body, ctx) => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Webhook body is not valid JSON' })
    return z.NEVER
  }
})

export const webhookRequestSchema = jsonBodySchema
  .pipe(
    z.object({
      event_id: z.guid()
    })
  )
  .transform((o) => ({
    eventId: o.event_id
  }))

export type WebhookRequest = z.infer<typeof webhookRequestSchema>

export const webhookEventSchema = z
  .object({
    event_id: z.guid(),
    event_timestamp: z.iso.datetime(),
    event_value: z.string(),
    record_id: z.string().min(1),
    record_type: z.string(),
    consent_id: z.string().min(1)
  })
  .transform((o) => ({
    eventId: o.event_id,
    eventTimestamp: o.event_timestamp,
    event_value: o.event_value,
    recordId: o.record_id,
    recordType: o.record_type,
    consentId: o.consent_id
  }))

export type WebhookEvent = z.infer<typeof webhookEventSchema>
