export interface PluginInput {
  config: Record<string, string>
  tokenPrefix: string
}

export interface ThirdPartyTokenPlugin {
  // Alerts will be fired for these status code responses
  // The CRI must also never retry request with these codes
  alertStatusCodes: number[]
  buildTokenRequest: (input: PluginInput) => ThirdPartyTokenRequestConfig
  isTokenValid: (tokenResponse: ThirdPartyTokenResponse) => boolean
  mapResponse: (responseBody: string) => ThirdPartyTokenResponse | undefined
  name: string
  parseConfigProfile: (config: Record<string, string>) => Record<string, string>
}

export interface ThirdPartyTokenRequestConfig {
  body: string
  endpointUrl: string
  headers: Record<string, string>
  timeoutMs: number
}

export interface ThirdPartyTokenResponse {
  tokenValue: string
}
