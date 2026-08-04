import type { ThirdPartyTokenEntity } from '@src/async-token/common/types/token-entity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(function () {})
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DeleteCommand: vi.fn(function (input: unknown) {
    return { input }
  }),
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn(function (input: unknown) {
    return { input }
  }),
  PutCommand: vi.fn(function (input: unknown) {
    return { input }
  })
}))

vi.mock('@common/util/env', () => ({
  requireEnv: (name: string) => {
    if (name === 'THIRDPARTY_TOKEN_DYNAMO_TABLE_NAME') return 'test-table'
    throw new Error(`Required environment variable "${name}" is not set`)
  }
}))

import { thirdPartyTokenRepository } from '@src/async-token/common/client/token-repository'

const buildEntity = (): ThirdPartyTokenEntity => ({
  id: 'token-1',
  pad: 30,
  tokenValue: 'abc',
  ttl: 123
})

describe('thirdPartyTokenRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getToken', () => {
    it('returns entity when found', async () => {
      const entity = buildEntity()
      mockSend.mockResolvedValue({ Item: entity })

      const result = await thirdPartyTokenRepository.getToken('token-1')

      expect(result).toEqual(entity)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Key: { id: 'token-1' }, TableName: 'test-table' } })
      )
    })

    it('returns undefined when not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined })

      const result = await thirdPartyTokenRepository.getToken('missing')

      expect(result).toBeUndefined()
    })
  })

  describe('putToken', () => {
    it('sends PutCommand with correct table and entity', async () => {
      mockSend.mockResolvedValue({})
      const entity = buildEntity()

      await thirdPartyTokenRepository.putToken(entity)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Item: entity, TableName: 'test-table' } })
      )
    })
  })

  describe('clearToken', () => {
    it('sends DeleteCommand with correct table and id', async () => {
      mockSend.mockResolvedValue({})

      await thirdPartyTokenRepository.clearToken('token-1')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Key: { id: 'token-1' }, TableName: 'test-table' } })
      )
    })
  })
})
