import type { EndpointProfile } from '@common/model/endpoint-profile'
import type { CloudFormationCustomResourceEvent, ScheduledEvent } from 'aws-lambda'

import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { latencyRecorder, resultRecorder } from '@common/handler/middleware/recorders'
import { cfnCustomResourceEventResponder } from '@common/handler/middleware/responders'
import { isCfnCustomResourceEvent } from '@common/util/cfn-custom-resource'
import { requireEnv } from '@common/util/env'
import { parseProfiles } from '@common/util/parse-profiles'
import { injectLambdaContext, logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import {
  createTokenRotationService,
  type TokenCredentialsProvider
} from '@govuk-one-login/cri-token-rotator'
import { createDynamoTokenRepository } from '@govuk-one-login/cri-token-rotator/dynamodb'
import { ecospendTokenStrategy } from '@src/ecospend-token/service/ecospend-token-strategy'

import middy from '@middy/core'

type EcospendTokenRotatorEvent = CloudFormationCustomResourceEvent | ScheduledEvent

const tokenCredentialsPathPrefix = requireEnv('TOKEN_ROTATOR_CREDENTIALS_PATH')

const ssmCredentialsProvider: TokenCredentialsProvider<EndpointProfile> = {
  getCredentials: (profile) => ssmConfigProvider.get(`${tokenCredentialsPathPrefix}/${profile}`)
}

const dynamoTokenRepository = createDynamoTokenRepository(
  { tableName: requireEnv('TOKEN_ROTATOR_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const ecospendTokenRotationService = createTokenRotationService<EndpointProfile>(
  {
    profiles: parseProfiles(requireEnv('ENDPOINT_PROFILES')),
    refreshWindowSeconds: requireEnv('TOKEN_ROTATOR_REFRESH_WINDOW_SECONDS')
  },
  {
    tokenRepository: dynamoTokenRepository,
    tokenRotationStrategy: ecospendTokenStrategy,
    credentialsProvider: ssmCredentialsProvider
  }
)

const lambdaHandler = async (event: EcospendTokenRotatorEvent): Promise<void> => {
  logger.info('Lambda invoked')

  if (isCfnCustomResourceEvent(event)) {
    if (event.RequestType === 'Delete') return
    await ecospendTokenRotationService.rotateAll({ force: true })
    return
  }
  await ecospendTokenRotationService.rotateAll()
}

export const handler = middy<EcospendTokenRotatorEvent, void>()
  .use(latencyRecorder()) // latencyRecorder is first
  .use(resultRecorder())
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .use(cfnCustomResourceEventResponder())
  .handler(lambdaHandler)
