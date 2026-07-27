import type {
  PluginInput,
  ThirdPartyTokenPlugin,
  ThirdPartyTokenRequestConfig,
  ThirdPartyTokenResponse
} from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin'

import { logger } from '@govuk-one-login/cri-logger'
import { z } from 'zod'

const PLUGIN_NAME = 'ob_token_plugin'

export const ecoSpendTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().min(1),
  scope: z.string(),
  token_type: z.string()
})

export const tokenProfileSSMSchema = z.object({
  'client-id': z.string().min(1),
  'client-secret': z.string().min(1),
  'endpoint-url': z.url(),
  'grant-type': z.string().min(1),
  scope: z.string().min(1)
})

export type TokenProfileSSMConfig = z.infer<typeof tokenProfileSSMSchema>

const createObThirdPartyTokenPlugin = (): ThirdPartyTokenPlugin => ({
  alertStatusCodes: [401, 403],
  buildTokenRequest: (input: PluginInput): ThirdPartyTokenRequestConfig => {
    const config = tokenProfileSSMSchema.parse(input.config)

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
        accept: 'json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeoutMs: 10_000
    }
  },
  isTokenValid: (tokenResponse: ThirdPartyTokenResponse) => {
    try {
      // TODO: Currently validates as a non-empty string (token is a UUID).
      // Once confirmed as JWT, validate header and body minimally, e.g:
      //
      // const [tokenHeaderB64] = tokenResponse.tokenValue.split('.')
      // if (!tokenHeaderB64) return false
      // const header = JSON.parse(Buffer.from(tokenHeaderB64, 'base64url').toString()) as {
      //   alg?: string
      //   typ?: string
      // }
      // return header.alg === 'RS256' && header.typ === 'JWT'
      //
      // Note: stubs will need a representative token value so validation always passes

      // This uuid validation is temporary
      return z.uuid().safeParse(tokenResponse.tokenValue).success
    } catch {
      return false
    }
  },
  mapResponse: (responseBody) => {
    try {
      const parsed = ecoSpendTokenResponseSchema.parse(JSON.parse(responseBody))

      return { tokenValue: parsed.access_token }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to parse token response - ${message}`)
      return undefined
    }
  },
  name: PLUGIN_NAME,
  parseConfigProfile: (config: Record<string, string>): TokenProfileSSMConfig => {
    return tokenProfileSSMSchema.parse(config)
  }
})

// Required for finding the plugin at runtime
export const createPlugin = createObThirdPartyTokenPlugin
