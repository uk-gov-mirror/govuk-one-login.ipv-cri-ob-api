import type { JWTClass } from '@govuk-one-login/data-vocab/credentials'

import { requireEnv } from '@common/util/env'
import { parseUrl } from '@common/util/url'
import { randomUUID } from 'node:crypto'

export type JwtEnvelopeClaims = Required<Pick<JWTClass, 'exp' | 'iss' | 'jti' | 'nbf' | 'sub'>>

export interface JwtEnvelopeGenerator {
  generate: (subject: string) => JwtEnvelopeClaims
}

interface JwtEnvelopeGeneratorConfig {
  issuer: string
  ttlSeconds: number
}

const createJwtEnvelopeGenerator = (config: JwtEnvelopeGeneratorConfig): JwtEnvelopeGenerator => ({
  generate: (subject) => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    return {
      exp: nowSeconds + config.ttlSeconds,
      iss: parseUrl(config.issuer).href,
      jti: `urn:uuid:${randomUUID()}`, // TODO: confirm jti strategy, using a random uuid based on check-hmrc but is this correct for OB
      nbf: nowSeconds,
      sub: subject
    }
  }
})

const parseTtlSeconds = (raw: string): number => {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`JWT_TTL_SECONDS must be a positive number, got "${raw}"`)
  }
  return value
}

export const jwtEnvelopeGenerator = createJwtEnvelopeGenerator({
  issuer: requireEnv('VC_DOMAIN'),
  ttlSeconds: parseTtlSeconds(requireEnv('JWT_TTL_SECONDS'))
})
