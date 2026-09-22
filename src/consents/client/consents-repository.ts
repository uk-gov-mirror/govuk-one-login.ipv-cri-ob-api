import type { ConsentEntity } from '@src/consents/model/database/consent-entity'

import { type DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

export interface ConsentsRepository {
  getConsent: (sessionId: string) => Promise<ConsentEntity | undefined>
  putConsent: (entity: ConsentEntity) => Promise<void>
}

export interface ConsentsRepositoryConfig {
  tableName: string
}

export const createConsentsRepository = (
  config: ConsentsRepositoryConfig,
  client: DynamoDBDocumentClient
): ConsentsRepository => ({
  getConsent: async (sessionId) => {
    const { Item } = await client.send(
      new GetCommand({
        ConsistentRead: true,
        Key: { sessionId },
        TableName: config.tableName
      })
    )
    return Item as ConsentEntity | undefined
  },
  putConsent: async (entity) => {
    await client.send(
      new PutCommand({
        Item: entity,
        TableName: config.tableName
      })
    )
  }
})
