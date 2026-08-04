import type { ThirdPartyTokenEntity } from '@src/async-token/common/types/token-entity'

export const calculateItemTtl = (maxAllowedLifetimeSeconds: number): number => {
  return Math.floor(Date.now() / 1000) + maxAllowedLifetimeSeconds
}

// Calling code uses this to determine when to start
// attempting to update the current near expiry token
export const isThirdPartyTokenNearExpiration = (
  entity: ThirdPartyTokenEntity,
  expirationWindowSeconds: number
): boolean => {
  const now = Math.floor(Date.now() / 1000)
  return now >= entity.ttl - expirationWindowSeconds
}

// Calling code uses this to determine if it is safe to return the token
// If we attempt to use a token too close to expiry, the token could
// expire before the CRI gets around to using it.
// pad is used to avoid using a token too close to expiry
export const isThirdPartyTokenExpired = (entity: ThirdPartyTokenEntity): boolean => {
  const now = Math.floor(Date.now() / 1000)
  return now >= entity.ttl - entity.pad
}

export const formatThirdPartyTokenExpiryDateTime = (ttlEpochSeconds: number): string =>
  new Date(ttlEpochSeconds * 1000).toISOString()
