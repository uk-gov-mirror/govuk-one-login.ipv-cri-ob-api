import { CriError } from '@govuk-one-login/cri-error-response'

export class BadRequestError extends CriError {
  constructor(message: string) {
    super(400, message)
  }
}
