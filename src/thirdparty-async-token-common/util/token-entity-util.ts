import type { ThirdPartyTokenEntity } from '../types/token-entity'

// This value needs to factor in HTTP Retries
// if multiple APIs are called using the same token in sequence
// and any response delays
const TOKEN_EXPIRY_PAD_SECONDS = 30

export const getThirdPartyTokenName = (tokenPrefix: string, tokenItemSuffix: string): string =>
  `${tokenPrefix}${tokenItemSuffix}`

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
// TOKEN_EXPIRY_PAD is used to avoid using a token too close to expiry
export const isThirdPartyTokenExpired = (entity: ThirdPartyTokenEntity): boolean => {
  const now = Math.floor(Date.now() / 1000)
  return now >= entity.ttl - TOKEN_EXPIRY_PAD_SECONDS
}

export const formatThirdPartyTokenExpiryDateTime = (ttlEpochSeconds: number): string =>
  new Date(ttlEpochSeconds * 1000).toISOString()
