import { z } from 'zod'

const jsonBodySchema = z.string().transform((body, ctx) => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Request body is not valid JSON' })
    return z.NEVER
  }
})

export const consentsRequestSchema = jsonBodySchema
  .pipe(
    z.object({
      bank_id: z.string().min(1),
      return_url: z.url({ protocol: /^https?$/ })
    })
  )
  .transform((o) => ({
    bankId: o.bank_id,
    returnUrl: o.return_url
  }))

export type ConsentsRequest = z.infer<typeof consentsRequestSchema>
