import type {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceUpdateEvent
} from 'aws-lambda'

const COMMON_EVENT_KEYS = {
  LogicalResourceId: 'logi-1',
  RequestId: 'req-1',
  ResourceProperties: { ServiceToken: 'svc' },
  ResourceType: 'Custom::MyResource',
  ResponseURL: 'https://cfn.example.test/response',
  ServiceToken: 'svc',
  StackId: 'stack-1'
}

export function buildCfnCustomResourceEvent(
  RequestType: 'Create'
): CloudFormationCustomResourceCreateEvent
export function buildCfnCustomResourceEvent(
  RequestType: 'Delete'
): CloudFormationCustomResourceDeleteEvent
export function buildCfnCustomResourceEvent(
  RequestType: 'Update'
): CloudFormationCustomResourceUpdateEvent
export function buildCfnCustomResourceEvent(
  RequestType: 'Create' | 'Delete' | 'Update'
): CloudFormationCustomResourceEvent {
  return (RequestType === 'Create'
    ? { ...COMMON_EVENT_KEYS, RequestType }
    : {
        ...COMMON_EVENT_KEYS,
        PhysicalResourceId: 'phys-1',
        RequestType
      }) as unknown as CloudFormationCustomResourceEvent
}
