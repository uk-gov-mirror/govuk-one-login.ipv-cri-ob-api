import type { ScheduledEvent } from 'aws-lambda'

import { createBaseHttpClient } from '@common/client/base-http-client'
import { dynamoDBDocumentClient } from '@common/client/dynamodb-client'
import { ssmConfigProvider } from '@common/client/ssm-config-provider'
import { latencyRecorder, resultRecorder } from '@common/handler/middleware/recorders'
import { EndpointProfile } from '@common/model/endpoint-profile'
import { requireEnv } from '@common/util/env'
import { parseProfiles } from '@common/util/parse-profiles'
import { injectLambdaContext, logger } from '@govuk-one-login/cri-logger'
import { logMetrics, metrics } from '@govuk-one-login/cri-metrics'
import { createTokenRetrievalService } from '@govuk-one-login/cri-token-rotator'
import { createDynamoTokenRepository } from '@govuk-one-login/cri-token-rotator/dynamodb'
import { createBankListRepository } from '@src/bank-list/client/bank-list-repository'
import { createEcospendBankListProvider } from '@src/bank-list/client/ecospend-bank-list-provider'
import { createBankListUpdateCoordinator } from '@src/bank-list/service/bank-list-update-coordinator'
import { createBankListUpdateService } from '@src/bank-list/service/bank-list-update-service'

import middy from '@middy/core'

const REFRESH_AFTER_SECONDS = 55 * 60

const enabledProfiles = parseProfiles(requireEnv('ENDPOINT_PROFILES'))
const bankListConfigPathPrefix = `/${requireEnv('PARAMETER_PREFIX')}/bank-list`

const dynamoTokenRepository = createDynamoTokenRepository(
  { tableName: requireEnv('TOKEN_ROTATOR_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const bankListRepository = createBankListRepository(
  { tableName: requireEnv('BANK_LIST_DB_TABLE_NAME') },
  dynamoDBDocumentClient
)

const tokenRetrievalService = createTokenRetrievalService(
  { profiles: Object.values(EndpointProfile) },
  { tokenRepository: dynamoTokenRepository }
)

const bankListProvider = createEcospendBankListProvider({
  httpClient: createBaseHttpClient({ endpointName: 'ecospend-bank-list' })
})

const bankListUpdateService = createBankListUpdateService(
  { bankListConfigPathPrefix, refreshAfterSeconds: REFRESH_AFTER_SECONDS },
  {
    bankListProvider,
    bankListRepository,
    externalConfigProvider: ssmConfigProvider,
    tokenRetrievalService
  }
)

const bankListUpdateCoordinator = createBankListUpdateCoordinator(
  { profiles: enabledProfiles },
  { bankListUpdateService }
)

const lambdaHandler = async (_event: ScheduledEvent): Promise<void> => {
  logger.info('Bank list updater invoked', { profiles: enabledProfiles })

  await bankListUpdateCoordinator.updateAll()
}

export const handler = middy<ScheduledEvent, void>()
  .use(latencyRecorder()) // latencyRecorder is first
  .use(resultRecorder())
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .handler(lambdaHandler)
