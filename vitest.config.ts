import { defineConfig } from 'vitest/config'

import path from 'node:path'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportsDirectory: 'coverage'
    },
    projects: [
      {
        resolve: {
          alias: {
            '@common': path.resolve(import.meta.dirname, 'src/common'),
            '@lib': path.resolve(import.meta.dirname, 'src/lib'),
            '@src': path.resolve(import.meta.dirname, 'src'),
            '@test-fixtures': path.resolve(import.meta.dirname, 'test/fixtures')
          }
        },
        test: {
          env: {
            AUDIT_COMPONENT_ID: 'ob-cri-audit',
            AUDIT_EVENT_NAME_PREFIX: 'OB_CRI_TEST',
            AUDIT_QUEUE_URL: 'https://sqs.example.test/audit',
            BANK_LIST_DB_TABLE_NAME: 'test-bank-list-table',
            CONSENTS_DB_TABLE_NAME: 'test-consents-table',
            ENDPOINT_PROFILES: 'STUB',
            IDENTITY_SCORE_DB_TABLE_NAME: 'test-identity-score-table',
            JWT_TTL_SECONDS: '7200',
            KMS_SIGNING_KEY_ID: 'test-kms-key-id',
            PARAMETER_PREFIX: 'test-prefix',
            PERSON_IDENTITY_DB_TABLE_NAME: 'test-person-identity-table',
            POWERTOOLS_METRICS_NAMESPACE: 'ob-api',
            POWERTOOLS_SERVICE_NAME: 'ob-api',
            SESSION_DB_TABLE_NAME: 'test-session-table',
            TOKEN_ROTATOR_CREDENTIALS_PATH: '/test-prefix/token-rotator/credentials',
            TOKEN_ROTATOR_DB_TABLE_NAME: 'test-token-rotator-table',
            TOKEN_ROTATOR_REFRESH_WINDOW_SECONDS: '300',
            VC_DOMAIN: 'review-ob.unit-test.account.gov.uk'
          },
          include: ['test/unit/**/*.test.ts'],
          name: 'unit',
          setupFiles: ['test/unit/setup.ts']
        }
      },
      {
        test: {
          include: ['test/infra/**/*.test.ts'],
          name: 'infra'
        }
      }
    ],
    silent: 'passed-only'
  }
})
