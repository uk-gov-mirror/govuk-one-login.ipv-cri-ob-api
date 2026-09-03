import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { BankListEntity, BanksEndpointProfile } from '@src/bank-list/model/bank-list'

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { requireEnv } from '@common/util/env'

export interface BankListRepository {
  getList: (profile: BanksEndpointProfile) => Promise<BankListEntity | undefined>
  replaceList: (entity: BankListEntity) => Promise<void>
}

interface BankListRepositoryConfig {
  tableName: string
}

export const createBankListRepository = (
  config: BankListRepositoryConfig,
  client: DynamoDBDocumentClient
): BankListRepository => ({
  getList: async (profile) => {
    const { Item } = await client.send(
      new GetCommand({
        ConsistentRead: true,
        Key: { profile },
        TableName: config.tableName
      })
    )
    return Item as BankListEntity | undefined
  },
  replaceList: async (entity) => {
    await client.send(
      new PutCommand({
        Item: entity,
        TableName: config.tableName
      })
    )
  }
})

export const getBankListRepository = (): BankListRepository =>
  createBankListRepository(
    { tableName: requireEnv('BANK_LIST_DB_TABLE_NAME') },
    dynamoDBDocumentClient
  )
