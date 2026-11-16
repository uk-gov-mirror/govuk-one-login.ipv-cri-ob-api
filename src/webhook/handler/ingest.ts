import type { APIGatewayProxyEvent } from 'aws-lambda'

import { SQSClient } from '@aws-sdk/client-sqs'
import { createSqsPublisher } from '@common/client/sqs-client'
import { requireEnv } from '@common/util/env'

const sqsClient = new SQSClient({})

const sqsPublisher = createSqsPublisher({
  client: sqsClient,
  config: { queueUrl: requireEnv('WEBHOOK_QUEUE_URL') }
})

export const handler = async (event: APIGatewayProxyEvent) => {
  console.log('Received payload: ', JSON.stringify(event.body))
  return { statusCode: 200, body: 'OK' }
}
