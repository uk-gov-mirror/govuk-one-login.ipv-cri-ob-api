import type {
  PluginInput,
  ThirdPartyTokenPlugin,
  ThirdPartyTokenRequestConfig,
  ThirdPartyTokenResponse
} from '@src/async-token/plugin-api/token-plugin'

import { logger } from '@govuk-one-login/cri-logger'
import { z } from 'zod'

const PLUGIN_NAME = 'ob-token-plugin'

export const ecoSpendTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.string()
})

export const tokenProfileSsmSchema = z.object({
  'client-id': z.string().min(1),
  'client-secret': z.string().min(1),
  'endpoint-url': z.url(),
  'grant-type': z.string().min(1),
  scope: z.string().min(1)
})

export type TokenProfileSsmConfig = z.infer<typeof tokenProfileSsmSchema>

const createObThirdPartyTokenPlugin = (): ThirdPartyTokenPlugin => ({
  alertStatusCodes: [401, 403],
  buildTokenRequest: (input: PluginInput): ThirdPartyTokenRequestConfig => {
    const config = tokenProfileSsmSchema.parse(input.config)

    const body = new URLSearchParams({
      client_id: config['client-id'],
      client_secret: config['client-secret'],
      grant_type: config['grant-type'],
      scope: config.scope
    }).toString()

    return {
      body,
      endpointUrl: config['endpoint-url'],
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeoutMs: 10_000
    }
  },
  isTokenValid: (tokenResponse: ThirdPartyTokenResponse) => {
    try {
      // TODO: temporary placeholder validation - see crosscore token validation
      return z.string().min(1).safeParse(tokenResponse.tokenValue).success
    } catch {
      return false
    }
  },
  mapResponse: (responseBody, maxAllowedLifetimeSeconds: number) => {
    try {
      // Rejects the response as invalid if expires_in does not meet this condition
      // ttl is set from config, so a shorter remote expires_in must be treated as failures
      const parsed = ecoSpendTokenResponseSchema
        .refine((data) => data.expires_in >= maxAllowedLifetimeSeconds, {
          message: `expires_in must be greater than or equal to maxAllowedLifetimeSeconds: ${maxAllowedLifetimeSeconds} — token lifetime is shorter than the stored ttl`
        })
        .parse(JSON.parse(responseBody))

      return { tokenValue: parsed.access_token }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to parse token response - ${message}`)
      return undefined
    }
  },
  name: PLUGIN_NAME,
  parseConfigProfile: (config: Record<string, string>): TokenProfileSsmConfig => {
    return tokenProfileSsmSchema.parse(config)
  }
})

// Required for finding the plugin at runtime
export const createPlugin = createObThirdPartyTokenPlugin
