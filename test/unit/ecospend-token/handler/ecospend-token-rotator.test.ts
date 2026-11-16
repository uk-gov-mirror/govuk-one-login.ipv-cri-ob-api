import type { Context, ScheduledEvent } from 'aws-lambda'

import { buildCfnCustomResourceEvent } from '@test-fixtures/aws/cfn-custom-resource-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRotateAll } = vi.hoisted(() => {
  return { mockRotateAll: vi.fn() }
})

vi.mock('@govuk-one-login/cri-token-rotator/dynamodb', () => ({
  createDynamoTokenRepository: () => ({ getToken: vi.fn(), putToken: vi.fn() })
}))

vi.mock('@govuk-one-login/cri-token-rotator', () => ({
  createTokenRotationService: () => ({ rotateAll: mockRotateAll })
}))

vi.mock('@common/handler/middleware/responders', () => ({
  cfnCustomResourceEventResponder: () => ({ after: () => undefined })
}))

import { handler } from '@src/ecospend-token/handler/ecospend-token-rotator'

const buildContext = (): Context => ({ functionName: 'ecospend-token-rotator-test' }) as Context

const buildScheduledEvent = (): ScheduledEvent => ({}) as ScheduledEvent

describe('ecospend-token-rotator handler', () => {
  beforeEach(() => {
    mockRotateAll.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls rotateAll without force for a scheduled event', async () => {
    await handler(buildScheduledEvent(), buildContext())

    expect(mockRotateAll).toHaveBeenCalledExactlyOnceWith()
  })

  it('calls rotateAll with force for a CloudFormation Create event', async () => {
    await handler(buildCfnCustomResourceEvent('Create'), buildContext())

    expect(mockRotateAll).toHaveBeenCalledExactlyOnceWith({ force: true })
  })

  it('calls rotateAll with force for a CloudFormation Update event', async () => {
    await handler(buildCfnCustomResourceEvent('Update'), buildContext())

    expect(mockRotateAll).toHaveBeenCalledExactlyOnceWith({ force: true })
  })

  it('does nothing on a CloudFormation Delete event', async () => {
    await handler(buildCfnCustomResourceEvent('Delete'), buildContext())

    expect(mockRotateAll).not.toHaveBeenCalled()
  })
})
