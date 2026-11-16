import type { SQSClient } from '@aws-sdk/client-sqs'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import type { WebhookEvent } from '@src/webhook/model/webhook-request'

export interface Config {
  queueUrl: string
}

export interface SQSPublisher {
  publish: (event: unknown) => Promise<void>
}

export const createSqsPublisher = ({
  client,
  config
}: {
  client: SQSClient
  config: Config
}): SQSPublisher => {
  return {
    publish: async (event) => {
      await client.send(
        new SendMessageCommand({
          QueueUrl: config.queueUrl,
          MessageBody: JSON.stringify(event)
        })
      )
    }
  }
}
