import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse
} from 'aws-lambda'

const isCfnCustomResourceEvent = (event: unknown): event is CloudFormationCustomResourceEvent =>
  typeof event === 'object' && event !== null && 'RequestType' in event && 'ResponseURL' in event

const getPhysicalResourceId = (event: CloudFormationCustomResourceEvent): string =>
  'PhysicalResourceId' in event
    ? event.PhysicalResourceId
    : `${event.LogicalResourceId}-${event.RequestId}`

type CustomResourceResult = { reason: string; status: 'FAILED' } | { status: 'SUCCESS' }

const putCustomResourceResponse = async (
  event: CloudFormationCustomResourceEvent,
  result: CustomResourceResult
): Promise<void> => {
  const commonKeys = {
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: getPhysicalResourceId(event),
    RequestId: event.RequestId,
    StackId: event.StackId
  }
  const payload: CloudFormationCustomResourceResponse =
    result.status === 'SUCCESS'
      ? { ...commonKeys, Status: 'SUCCESS' }
      : { ...commonKeys, Status: 'FAILED', Reason: result.reason }
  const response = await fetch(event.ResponseURL, { body: JSON.stringify(payload), method: 'PUT' })
  if (!response.ok) {
    throw new Error(`Custom Resource response URL returned ${response.status.toString()}`)
  }
}

export { isCfnCustomResourceEvent, putCustomResourceResponse }
