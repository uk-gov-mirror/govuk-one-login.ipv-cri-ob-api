import { defineConfig } from 'vitest/config'

import path from 'node:path'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/types/**'],
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: 'coverage'
    },
    projects: [
      {
        resolve: {
          alias: {
            '@common': path.resolve(__dirname, 'src/common'),
            '@src': path.resolve(__dirname, 'src')
          }
        },
        test: {
          env: {
            AUDIT_COMPONENT_ID: 'ob-cri-audit',
            AUDIT_EVENT_NAME_PREFIX: 'OB_CRI_TEST',
            AUDIT_QUEUE_URL: 'https://sqs.example.test/audit',
            JWT_TTL_SECONDS: '7200',
            KMS_SIGNING_KEY_ID: 'test-kms-key-id',
            POWERTOOLS_METRICS_NAMESPACE: 'ob-api',
            POWERTOOLS_SERVICE_NAME: 'ob-api',
            VC_DOMAIN: 'review-ob.unit-test.account.gov.uk'
          },
          include: ['test/unit/**/*.test.ts'],
          name: 'unit'
        }
      }
    ],
    silent: 'passed-only'
  }
})
