import type { StoredBank } from '@src/bank-list/model/bank-list'

import { z } from 'zod'

const ecospendBankSchema = z
  .object({
    bank_id: z.string().min(1),
    friendly_name: z.string().min(1),
    service_status: z.boolean()
  })
  .transform(
    (bank): StoredBank => ({
      bankId: bank.bank_id,
      friendlyName: bank.friendly_name,
      serviceStatus: bank.service_status
    })
  )

export const ecospendBankListResponseSchema = z.object({
  data: z.array(ecospendBankSchema),
  meta: z.object({
    current_page: z.literal(1),
    total_count: z.number().int().nonnegative(),
    total_pages: z.literal(1)
  })
})
