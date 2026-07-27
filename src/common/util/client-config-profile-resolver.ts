/**
 * Configuration profiles for Open Banking provider integration.
 * Multiple client IDs can map to the same profile for a shared configuration.
 */
export type ConfigProfileName = 'LIVE' | 'STUB' | 'UAT'

/* eslint-disable perfectionist/sort-objects */
const clientIdToConfigProfileMapping: Record<string, ConfigProfileName> = {
  'ipv-core-stub': 'STUB', // Legacy core-stub-id
  'ipv-core-stub-aws-build': 'STUB', // Core-Stub client id that indicates routing requests to our stubs of third-parties
  'ipv-core-stub-aws-prod': 'STUB',
  'ipv-core-stub-aws-build_3rdparty': 'UAT', // Core-Stub client ids that indicate routing requests to third-parties
  'ipv-core-stub-aws-prod_3rdparty': 'UAT',
  'ipv-core-stub-pre-prod-aws-build': 'LIVE', // Pre-Prod core-Stub client ids, still deploy but not connected to ob cri
  'ipv-core-3rd-party-stubs': 'STUB', // Real ipv-core client id that indicates routing requests to our stubs of third-parties
  'ipv-core': 'LIVE' // Production
}

export const getConfigProfileNameFromClientId = (clientId: string): ConfigProfileName => {
  const configProfileName = clientIdToConfigProfileMapping[clientId]
  if (!configProfileName) throw new Error(`Unknown clientId: ${clientId}`)
  return configProfileName
}
