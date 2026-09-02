import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { TokenEntity } from '@lib/token-rotator/model/token-entity'

import { createDynamoTokenRepository } from '@lib/token-rotator/client/dynamo-token-repository'
import { TokenProfile } from '@lib/token-rotator/model/token-profile'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { TABLE_NAME } = vi.hoisted(() => {
  const TABLE_NAME = 'token-rotator-table'
  process.env['TOKEN_ROTATOR_DB_TABLE_NAME'] = TABLE_NAME
  return { TABLE_NAME }
})

const mockSendCommand = vi.fn()
const mockDynamoDBDocumentClient = { send: mockSendCommand } as unknown as DynamoDBDocumentClient

const repository = createDynamoTokenRepository(
  { tableName: TABLE_NAME },
  mockDynamoDBDocumentClient
)

const buildTokenEntity = (overrides: Partial<TokenEntity> = {}): TokenEntity => ({
  id: TokenProfile.STUB,
  tokenValue: 'cached-token',
  ttl: 1_000,
  ...overrides
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSendCommand.mockResolvedValue({})
})

describe('token-repository', () => {
  describe('getToken', () => {
    it('queries DynamoDB with the token profile', async () => {
      await repository.getToken(TokenProfile.STUB)

      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Key: { id: TokenProfile.STUB }, TableName: TABLE_NAME }
        })
      )
    })

    it('returns a TokenEntity when present', async () => {
      const entity = buildTokenEntity()
      mockSendCommand.mockResolvedValueOnce({ Item: entity })

      expect(await repository.getToken(TokenProfile.STUB)).toEqual(entity)
    })

    it('returns undefined when no Item is returned', async () => {
      expect(await repository.getToken(TokenProfile.STUB)).toBeUndefined()
    })
  })

  describe('putToken', () => {
    it('writes a TokenEntity', async () => {
      const entity = buildTokenEntity({
        tokenValue: 'new-token'
      })

      await repository.putToken(entity)

      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Item: entity, TableName: TABLE_NAME }
        })
      )
    })
  })
})
