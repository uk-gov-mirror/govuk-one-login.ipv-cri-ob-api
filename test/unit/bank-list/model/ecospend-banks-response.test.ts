import { ecospendBankListResponseSchema } from '@src/bank-list/model/ecospend-banks-response'
import { describe, expect, it } from 'vitest'

const validBank = {
  bank_id: 'example-bank',
  friendly_name: 'Example Bank',
  service_status: true,
  // example additional ignored fields
  is_sandbox: true,
  logo: 'https://provider.test/bank.svg'
}

const validMeta = {
  current_page: 1,
  total_count: 1,
  total_pages: 1
}

const buildResponse = (data: unknown[]) => ({
  data,
  meta: {
    current_page: 1,
    total_count: data.length,
    total_pages: 1
  }
})

describe('ecospendBankListResponseSchema', () => {
  it('validates and maps a valid response', () => {
    const result = ecospendBankListResponseSchema.parse(
      buildResponse([
        validBank,
        {
          ...validBank,
          bank_id: 'mock-bank',
          friendly_name: 'Mock Bank',
          service_status: false
        }
      ])
    )

    expect(result).toEqual({
      data: [
        {
          bankId: 'example-bank',
          friendlyName: 'Example Bank',
          serviceStatus: true
        },
        {
          bankId: 'mock-bank',
          friendlyName: 'Mock Bank',
          serviceStatus: false
        }
      ],
      meta: {
        current_page: 1,
        total_count: 2,
        total_pages: 1
      }
    })
  })

  it('accepts an empty banks list', () => {
    const result = ecospendBankListResponseSchema.parse(buildResponse([]))

    expect(result).toEqual({
      data: [],
      meta: {
        current_page: 1,
        total_count: 0,
        total_pages: 1
      }
    })
  })

  it.each([
    ['data is missing', { meta: validMeta }],
    ['meta is missing', { data: [validBank] }],
    [
      'total pages is not equal to 1',
      { data: [validBank], meta: { ...validMeta, total_pages: 2 } }
    ],
    [
      'current page is not equal to 1',
      { data: [validBank], meta: { ...validMeta, current_page: -1 } }
    ],
    [
      'total count is a non-negative integer',
      { data: [validBank], meta: { ...validMeta, total_count: -0.5 } }
    ],
    ['data is null', { data: null, meta: validMeta }],
    ['data is not an array', { data: {}, meta: validMeta }],
    ['bank ID is empty', buildResponse([{ ...validBank, bank_id: '' }])],
    ['friendly name is empty', buildResponse([{ ...validBank, friendly_name: '' }])],
    ['service status is not boolean', buildResponse([{ ...validBank, service_status: 'true' }])],
    [
      'bank ID is missing',
      { data: [{ friendly_name: 'missing id', service_status: false }], meta: validMeta }
    ]
  ])('rejects a response when %s', (_description, response) => {
    expect(ecospendBankListResponseSchema.safeParse(response).success).toBe(false)
  })
})
