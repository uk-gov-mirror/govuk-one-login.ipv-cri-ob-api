import { CriError } from '@govuk-one-login/cri-error-response'

export class SessionNotFoundError extends CriError {
  constructor() {
    super(401, 'Session not found')
  }
}
