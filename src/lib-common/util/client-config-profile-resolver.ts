/**
 * Configuration profiles for Open Banking provider integration.
 * Multiple client IDs can map to the same profile for a shared configuration.
 */
export type ConfigProfileName = 'LIVE' | 'STUB' | 'UAT'

const clientIdToConfigProfileMapping: Record<string, ConfigProfileName> = {
  // Legacy core-stub-id
  'ipv-core-stub': 'STUB',
  // Core-Stub client id that indicates routing requests to our stubs of third-parties
  'ipv-core-stub-aws-build': 'STUB',
  'ipv-core-stub-aws-prod': 'STUB',
  // Core-Stub client ids that indicate routing requests to third-parties
  'ipv-core-stub-aws-build_3rdparty': 'UAT',
  'ipv-core-stub-aws-prod_3rdparty': 'UAT',
  // Pre-Prod core-Stub client ids, still deploy but not connected to ob cri
  'ipv-core-stub-pre-prod-aws-build': 'LIVE',
  // Real ipv-core client id that indicates routing requests to our stubs of third-parties
  'ipv-core-3rd-party-stubs': 'STUB',
  // Real ipv-core client id that uses the production profile
  'ipv-core': 'LIVE'
}

export const getConfigProfileNameFromClientId = (
  clientId: string,
  mapping: Record<string, string> = clientIdToConfigProfileMapping
): ConfigProfileName => {
  const configProfileName = mapping[clientId] as ConfigProfileName | undefined
  if (!configProfileName) throw new Error(`Unknown clientId: ${clientId}`)
  return configProfileName
}
