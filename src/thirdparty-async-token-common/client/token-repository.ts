import type { ThirdPartyTokenEntity } from '../types/token-entity'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { requireEnv } from '@common/util/env'

export interface ThirdPartyTokenRepository {
  clearToken: (id: string) => Promise<void>
  getToken: (id: string) => Promise<ThirdPartyTokenEntity | undefined>
  putToken: (entity: ThirdPartyTokenEntity) => Promise<void>
}

const createThirdPartyTokenRepository = (
  client: DynamoDBDocumentClient,
  tableName: string
): ThirdPartyTokenRepository => ({
  clearToken: async (id) => {
    await client.send(new DeleteCommand({ Key: { id }, TableName: tableName }))
  },
  getToken: async (id) => {
    const { Item } = await client.send(new GetCommand({ Key: { id }, TableName: tableName }))
    return Item as ThirdPartyTokenEntity | undefined
  },
  putToken: async (entity) => {
    await client.send(new PutCommand({ Item: entity, TableName: tableName }))
  }
})

export const thirdPartyTokenRepository = createThirdPartyTokenRepository(
  dynamoDBDocumentClient,
  requireEnv('THIRDPARTY_TOKEN_DYNAMO_TABLE_NAME')
)
