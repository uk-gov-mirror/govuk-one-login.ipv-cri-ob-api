import type { CloudFormationCustomResourceEvent } from 'aws-lambda'

import {
  isCfnCustomResourceEvent,
  putCustomResourceResponse
} from '@common/util/cfn-custom-resource'
import { buildCfnCustomResourceEvent } from '@test-fixtures/aws/cfn-custom-resource-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('isCfnCustomResourceEvent', () => {
  it('accepts an object with RequestType and ResponseURL', () => {
    expect(isCfnCustomResourceEvent(buildCfnCustomResourceEvent('Update'))).toBe(true)
  })

  it('rejects null', () => {
    expect(isCfnCustomResourceEvent(null)).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isCfnCustomResourceEvent('not-an-event')).toBe(false)
  })

  it('rejects an object missing RequestType', () => {
    expect(isCfnCustomResourceEvent({ ResponseURL: 'https://x.test' })).toBe(false)
  })

  it('rejects an object missing ResponseURL', () => {
    expect(isCfnCustomResourceEvent({ RequestType: 'Create' })).toBe(false)
  })
})

describe('putCustomResourceResponse', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PUTs a SUCCESS payload to the ResponseURL with the common keys', async () => {
    await putCustomResourceResponse(buildCfnCustomResourceEvent('Update'), { status: 'SUCCESS' })

    expect(fetchMock).toHaveBeenCalledWith('https://cfn.example.test/response', {
      body: JSON.stringify({
        LogicalResourceId: 'logi-1',
        PhysicalResourceId: 'phys-1',
        RequestId: 'req-1',
        StackId: 'stack-1',
        Status: 'SUCCESS'
      }),
      method: 'PUT'
    })
  })

  it('falls back to LogicalResourceId-RequestId when PhysicalResourceId is absent', async () => {
    const { PhysicalResourceId: _, ...event } = buildCfnCustomResourceEvent('Update')

    await putCustomResourceResponse(event as CloudFormationCustomResourceEvent, {
      status: 'SUCCESS'
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"PhysicalResourceId":"logi-1-req-1"')
      })
    )
  })

  it('PUTs a FAILED payload including the reason', async () => {
    await putCustomResourceResponse(buildCfnCustomResourceEvent('Update'), {
      reason: 'crumbs',
      status: 'FAILED'
    })

    expect(fetchMock).toHaveBeenCalledWith('https://cfn.example.test/response', {
      body: JSON.stringify({
        LogicalResourceId: 'logi-1',
        PhysicalResourceId: 'phys-1',
        RequestId: 'req-1',
        StackId: 'stack-1',
        Status: 'FAILED',
        Reason: 'crumbs'
      }),
      method: 'PUT'
    })
  })

  it('throws when the ResponseURL returns a non-ok status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(
      putCustomResourceResponse(buildCfnCustomResourceEvent('Update'), { status: 'SUCCESS' })
    ).rejects.toThrow(/Custom Resource response URL returned 500/)
  })
})
