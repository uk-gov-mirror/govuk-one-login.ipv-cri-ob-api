import { KMSClient, MessageType, SignCommand, SigningAlgorithmSpec } from '@aws-sdk/client-kms'
import { requireEnv } from '@common/util/env'
import { captureMetricWithDimensions, MetricUnit } from '@govuk-one-login/cri-metrics'
import { SigningError } from '@src/issue-credential/error'
import {
  KMS_SIGN_LATENCY_METRIC_NAME,
  KmsSignMetricDimensions,
  KmsSignResult
} from '@src/issue-credential/model/metrics/kms-metrics'
import { createHash } from 'node:crypto'

const SIGNING_ALGO = {
  digest: 'sha256',
  spec: SigningAlgorithmSpec.ECDSA_SHA_256
} as const

export interface KmsSigner {
  sign: (input: Buffer) => Promise<Buffer>
}

export interface KmsSignerConfig {
  keyID: string
}

export const createKmsSigner = (config: KmsSignerConfig, client: KMSClient): KmsSigner => ({
  sign: async (input) => {
    const digest = createHash(SIGNING_ALGO.digest).update(input).digest()

    const start = performance.now()
    let result: KmsSignResult = KmsSignResult.ERROR
    try {
      const response = await client.send(
        new SignCommand({
          KeyId: config.keyID,
          Message: digest,
          MessageType: MessageType.DIGEST,
          SigningAlgorithm: SIGNING_ALGO.spec
        })
      )
      if (!response.Signature) throw new SigningError()
      result = KmsSignResult.SUCCESS
      return Buffer.from(response.Signature)
    } finally {
      captureMetricWithDimensions(
        KMS_SIGN_LATENCY_METRIC_NAME,
        { [KmsSignMetricDimensions.Result]: result },
        performance.now() - start,
        MetricUnit.Milliseconds
      )
    }
  }
})

export const kmsSigner = createKmsSigner(
  { keyID: requireEnv('KMS_SIGNING_KEY_ID') },
  new KMSClient({})
)
