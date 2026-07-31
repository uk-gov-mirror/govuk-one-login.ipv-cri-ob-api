import type { IdentityCheckCredentialJWTClass } from '@govuk-one-login/data-vocab/credentials'
import type { KmsSigner } from '@src/issue-credential/client/kms-signer'

import { requireEnv } from '@common/util/env'
import { kmsSigner } from '@src/issue-credential/client/kms-signer'
import { derToJose } from 'ecdsa-sig-formatter'
import { createHash } from 'node:crypto'

export interface VerifiableCredentialSigner {
  sign: (claimSet: IdentityCheckCredentialJWTClass) => Promise<string>
}

export interface VerifiableCredentialSignerConfig {
  keyID: string
  vcDomain: string
}

interface JwsHeader {
  alg: 'ES256'
  kid: string
  typ: 'JWT'
}

interface VerifiableCredentialSignerCollaborators {
  kmsSigner: KmsSigner
}

const base64url = (input: string): string => Buffer.from(input, 'utf8').toString('base64url')

const buildDidKid = (keyId: string, domainName: string): string => {
  const keyIdHash = createHash('sha256').update(keyId, 'utf8').digest('hex')
  return `did:web:${domainName}#${keyIdHash}`
}

export const createVerifiableCredentialSigner = (
  config: VerifiableCredentialSignerConfig,
  collaborators: VerifiableCredentialSignerCollaborators
): VerifiableCredentialSigner => ({
  sign: async (claimSet) => {
    const jwsHeader: JwsHeader = {
      alg: 'ES256',
      kid: buildDidKid(config.keyID, config.vcDomain),
      typ: 'JWT'
    }

    const header = base64url(JSON.stringify(jwsHeader))
    const payload = base64url(JSON.stringify(claimSet))

    const signingInput = Buffer.from(`${header}.${payload}`, 'utf8')
    const signingOutput = await collaborators.kmsSigner.sign(signingInput)

    const signature = derToJose(signingOutput.toString('base64'), 'ES256') // derToJose returns a base64url encoded string

    return `${header}.${payload}.${signature}`
  }
})

export const verifiableCredentialSigner = createVerifiableCredentialSigner(
  {
    keyID: requireEnv('KMS_SIGNING_KEY_ID'),
    vcDomain: requireEnv('VC_DOMAIN')
  },
  { kmsSigner }
)
