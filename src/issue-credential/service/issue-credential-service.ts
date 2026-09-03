import type { SessionRepository } from '@common/client/session-repository'
import type { AuditEventPublisher } from '@common/service/audit-event-publisher'
import type { IdentityScoreRepository } from '@src/issue-credential/client/identity-score-repository'
import type { PersonDetailsRepository } from '@src/issue-credential/client/person-details-repository'
import type { IssueCredentialRequest } from '@src/issue-credential/model/issue-credential-request'
import type { IssueCredentialResponse } from '@src/issue-credential/model/issue-credential-response'
import type { JwtEnvelopeGenerator } from '@src/issue-credential/service/jwt-envelope-generator'
import type { VerifiableCredentialBuilder } from '@src/issue-credential/service/verifiable-credential-builder'
import type { VerifiableCredentialSigner } from '@src/issue-credential/service/verifiable-credential-signer'

import { SessionNotFoundError } from '@common/error/session-not-found-error'
import { logger } from '@govuk-one-login/cri-logger'
import { IdentityScoreNotFoundError, PersonDetailsNotFoundError } from '@src/issue-credential/error'

interface IssueCredentialCollaborators {
  auditEventPublisher: AuditEventPublisher
  identityScoreRepository: IdentityScoreRepository
  jwtEnvelopeGenerator: JwtEnvelopeGenerator
  personDetailsRepository: PersonDetailsRepository
  sessionRepository: SessionRepository
  verifiableCredentialBuilder: VerifiableCredentialBuilder
  verifiableCredentialSigner: VerifiableCredentialSigner
}

type IssueCredentialService = (request: IssueCredentialRequest) => Promise<IssueCredentialResponse>

export const createIssueCredentialService = (
  collaborators: IssueCredentialCollaborators
): IssueCredentialService => {
  return async (request) => {
    const session = await collaborators.sessionRepository.findByAccessToken(request.accessToken)
    if (!session) throw new SessionNotFoundError()
    logger.appendKeys({
      cri_session_id: session.sessionId,
      govuk_signin_journey_id: session.clientSessionId
    })
    logger.info('Session retrieved')

    const [personDetails, identityScore] = await Promise.all([
      collaborators.personDetailsRepository
        .findBySessionId(session.sessionId)
        .then((personDetails) => {
          logger.info('Person details retrieved')
          return personDetails
        }),
      collaborators.identityScoreRepository
        .findBySessionId(session.sessionId)
        .then((identityScore) => {
          logger.info('Identity score retrieved')
          return identityScore
        })
    ])
    if (!personDetails) throw new PersonDetailsNotFoundError()
    if (!identityScore) throw new IdentityScoreNotFoundError()

    const envelope = collaborators.jwtEnvelopeGenerator.generate(session.subject)
    logger.info('JWT envelope generated')

    const claimSet = collaborators.verifiableCredentialBuilder.build({
      envelope,
      identityScore,
      personDetails
    })
    logger.info('Claim set created')

    const signedCredential = await collaborators.verifiableCredentialSigner.sign(claimSet)
    logger.info('Credential signed')

    await collaborators.auditEventPublisher.publishVCIssued({ session })
    await collaborators.auditEventPublisher.publishJourneyEnd({ session })

    return { credential: signedCredential }
  }
}
