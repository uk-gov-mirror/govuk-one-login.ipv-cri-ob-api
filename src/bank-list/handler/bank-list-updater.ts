import type { ScheduledEvent } from 'aws-lambda'

import { injectLambdaContext, logMetrics } from '@common/handler/middleware'
import { requireEnv } from '@common/util/env'
import { logger } from '@govuk-one-login/cri-logger'
import { metrics } from '@govuk-one-login/cri-metrics'
import { getDynamoTokenRepository } from '@lib/token-rotator/client/dynamo-token-repository'
import { createTokenRetrievalService } from '@lib/token-rotator/service/token-retrieval-service'
import { getBankListRepository } from '@src/bank-list/client/bank-list-repository'
import { createEcospendBankListProvider } from '@src/bank-list/client/ecospend-bank-list-provider'
import { createGetBanksRequestConfigFromSsm } from '@src/bank-list/client/get-banks-request-config-from-ssm'
import { createBankListUpdateCoordinator } from '@src/bank-list/service/bank-list-update-coordinator'
import { createBankListUpdateService } from '@src/bank-list/service/bank-list-update-service'
import { parseProfiles } from '@src/bank-list/util/load-config-from-env'

import middy from '@middy/core'

const REFRESH_AFTER_SECONDS = 55 * 60
const enabledProfiles = parseProfiles(requireEnv('BANK_LIST_PROFILES'))

const tokenRetrievalService = createTokenRetrievalService({
  tokenRepository: getDynamoTokenRepository()
})

const bankListConfigPath = `/${requireEnv('PARAMETER_PREFIX')}/bank-list`
const getBanksRequestConfig = createGetBanksRequestConfigFromSsm(bankListConfigPath)

const bankListProvider = createEcospendBankListProvider({
  getBanksRequestConfig,
  retrieveAccessToken: tokenRetrievalService.retrieveToken
})

const updateBankList = createBankListUpdateService(
  {
    bankListProvider,
    bankListRepository: getBankListRepository()
  },
  {
    refreshAfterSeconds: REFRESH_AFTER_SECONDS
  }
)

const bankListUpdateCoordinator = createBankListUpdateCoordinator(
  {
    updateBankList
  },
  {
    profiles: enabledProfiles
  }
)

const lambdaHandler = async (_event: ScheduledEvent): Promise<void> => {
  logger.info('Bank list updater invoked', { profiles: enabledProfiles })

  await bankListUpdateCoordinator.updateAll()
}

export const handler = middy<ScheduledEvent, void>()
  .use(injectLambdaContext(logger, { resetKeys: true }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }))
  .handler(lambdaHandler)
