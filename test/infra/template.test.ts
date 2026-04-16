import { cfnOutputSchema, cfnParameterSchema, loadTemplate } from './helpers'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const template = loadTemplate('template.yaml')

const resources = template['Resources'] as Record<string, Record<string, unknown>>
const parameters = template['Parameters'] as Record<string, unknown>
const outputs = template['Outputs'] as Record<string, unknown>
const conditions = template['Conditions'] as Record<string, unknown>
const mappings = template['Mappings'] as Record<string, unknown>

describe('template.yaml structure', () => {
  it('has required top-level keys', () => {
    expect(template).toHaveProperty('AWSTemplateFormatVersion', '2010-09-09')
    expect(template).toHaveProperty('Transform')
    expect(template).toHaveProperty('Resources')
    expect(template).toHaveProperty('Parameters')
    expect(template).toHaveProperty('Outputs')
    expect(template).toHaveProperty('Conditions')
    expect(template).toHaveProperty('Mappings')
    expect(template).toHaveProperty('Globals')
  })
})

describe('template.yaml parameters', () => {
  const requiredParams = [
    'Environment',
    'VpcStackName',
    'PermissionsBoundary',
    'CodeSigningConfigArn',
    'ParameterPrefix',
    'DeploymentType',
    'LogGroupRetentionInDays',
    'LambdaDeploymentPreference',
  ]

  it.each(requiredParams)('has parameter: %s', (param) => {
    const result = cfnParameterSchema.safeParse(parameters[param])
    expect(result.success, `Parameter ${param} failed validation: ${JSON.stringify(result.error?.issues)}`).toBe(true)
  })

  it('Environment allows only valid values', () => {
    const env = parameters['Environment'] as { AllowedValues: string[] }
    expect(env.AllowedValues).toEqual(['dev', 'build', 'staging', 'integration', 'production'])
  })
})

describe('template.yaml conditions', () => {
  const expectedConditions = [
    'IsDeployedFromPipeline',
    'AlarmsEnabled',
    'LogSendingEnabled',
    'IsProduction',
    'UsePermissionsBoundary',
    'UseCodeSigning',
    'UseCanaryDeploymentAlarms',
    'AddProvisionedConcurrency',
    'UseParameterPrefix',
  ]

  it.each(expectedConditions)('has condition: %s', (condition) => {
    expect(conditions).toHaveProperty(condition)
  })
})

describe('template.yaml mappings', () => {
  const environments = ['dev', 'build', 'staging', 'integration', 'production']

  it.each(environments)('EnvironmentConfiguration has entry for %s', (env) => {
    const envConfig = mappings?.['EnvironmentConfiguration'] as Record<string, unknown>
    expect(envConfig).toHaveProperty(env)
  })

  it.each(environments)('ProvisionedConcurrency has entry for %s', (env) => {
    const pc = mappings?.['ProvisionedConcurrency'] as Record<string, Record<string, number>>
    expect(pc?.['Environment']).toHaveProperty(env)
  })

  it.each(environments)('MemorySizeMapping has entry for %s', (env) => {
    const mem = mappings?.['MemorySizeMapping'] as Record<string, Record<string, number>>
    expect(mem?.['Environment']).toHaveProperty(env)
  })
})

describe('template.yaml resources', () => {
  const expectedResources = [
    'PublicAPI',
    'PublicAPILogGroup',
    'PrivateAPI',
    'PrivateAPILogGroup',
    'BasicFunction',
    'BasicFunctionLogGroup',
    'BasicFunctionLogGroupSubscriptionFilterCsls',
    'BasicFunctionPermission',
    'BasicFunctionAliasPermission',
    'PublicAPIUsagePlan',
    'PrivateAPIUsagePlan',
    'LoggingKmsKey',
    'CodeDeployServiceRole',
    'JWKSBucketRole',
  ]

  it.each(expectedResources)('has resource: %s', (resource) => {
    expect(resources).toHaveProperty(resource)
  })

  it('all resources have a Type', () => {
    for (const [name, resource] of Object.entries(resources)) {
      expect(resource, `Resource ${name} missing Type`).toHaveProperty('Type')
    }
  })

  it('BasicFunction uses arm64 architecture via Globals', () => {
    const globals = template['Globals'] as Record<string, Record<string, unknown>>
    const architectures = globals['Function']?.['Architectures'] as string[]
    expect(architectures).toContain('arm64')
  })

  it('BasicFunction has deployment preference configured', () => {
    const props = resources['BasicFunction']?.['Properties'] as Record<string, unknown>
    expect(props).toHaveProperty('DeploymentPreference')
    expect(props).toHaveProperty('AutoPublishAlias', 'live')
  })

  it('log groups reference LogGroupRetentionInDays', () => {
    for (const [name, resource] of Object.entries(resources)) {
      if ((resource['Type'] as string) === 'AWS::Logs::LogGroup') {
        const props = resource['Properties'] as Record<string, unknown>
        expect(props, `${name} missing RetentionInDays`).toHaveProperty('RetentionInDays')
      }
    }
  })
})

describe('template.yaml outputs', () => {
  const expectedOutputs = [
    'StackName',
    'PublicAPIGatewayID',
    'PublicApiBaseUrl',
    'PrivateAPIGatewayID',
    'PrivateAPIBaseUrl',
  ]

  it.each(expectedOutputs)('has output: %s', (output) => {
    const result = cfnOutputSchema.safeParse(outputs[output])
    expect(result.success, `Output ${output} failed validation: ${JSON.stringify(result.error?.issues)}`).toBe(true)
  })
})

describe('template.yaml globals', () => {
  const globals = template['Globals'] as Record<string, Record<string, unknown>>

  it('sets Function runtime to nodejs24.x', () => {
    expect(globals['Function']?.['Runtime']).toBe('nodejs24.x')
  })

  it('enables X-Ray tracing', () => {
    expect(globals['Function']?.['Tracing']).toBe('Active')
  })

  it('sets required environment variables', () => {
    const envVars = (globals['Function']?.['Environment'] as Record<string, Record<string, unknown>>)?.['Variables']
    const schema = z.object({
      AWS_LAMBDA_EXEC_WRAPPER: z.string(),
      AWS_STACK_NAME: z.unknown(),
      ENVIRONMENT: z.unknown(),
      PARAMETER_PREFIX: z.unknown(),
      POWERTOOLS_LOG_LEVEL: z.string(),
      POWERTOOLS_METRICS_NAMESPACE: z.unknown(),
    })
    expect(schema.safeParse(envVars).success).toBe(true)
  })
})
