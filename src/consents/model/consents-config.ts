import { z } from 'zod'

export const consentsConfigSchema = z
  .object({
    'endpoint-url': z.string().min(1)
  })
  .transform((o) => ({
    endpointUrl: o['endpoint-url']
  }))

export type BanksRequestConfig = z.infer<typeof consentsConfigSchema>
