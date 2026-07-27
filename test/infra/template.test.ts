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
    'LambdaDeploymentPreference'
  ]

  it.each(requiredParams)('has parameter: %s', (param) => {
    const result = cfnParameterSchema.safeParse(parameters[param])
    expect(
      result.success,
      `Parameter ${param} failed validation: ${JSON.stringify(result.error?.issues)}`
    ).toBe(true)
  })

  it('Environment allows only valid values', () => {
    const env = parameters['Environment'] as { AllowedValues: string[] }
    expect(env.AllowedValues).toEqual(['dev', 'build', 'staging', 'integration', 'production'])
  })
})

describe('template.yaml conditions', () => {
  const expectedConditions = [
    'IsDeployedFromPipeline',
    'IsNotDeployedFromPipeline',
    'AlarmsEnabled',
    'IsProduction',
    'IsNotProduction',
    'UsePermissionsBoundary',
    'UseCodeSigning',
    'UseCanaryDeploymentAlarms',
    'AddProvisionedConcurrency',
    'UseParameterPrefix',
    'CreateTestResourcesParam'
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

  it.each(environments)(
    'EnvironmentConfiguration has provisionedConcurrentExecutions for %s',
    (env) => {
      const envConfig = mappings?.['EnvironmentConfiguration'] as Record<
        string,
        Record<string, unknown>
      >
      expect(envConfig?.[env]).toHaveProperty('provisionedConcurrentExecutions')
    }
  )

  it.each(environments)('EnvironmentConfiguration has memorySize for %s', (env) => {
    const envConfig = mappings?.['EnvironmentConfiguration'] as Record<
      string,
      Record<string, unknown>
    >
    expect(envConfig?.[env]).toHaveProperty('memorySize')
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
    'BasicFunctionPermission',
    'BasicFunctionAliasPermission',
    'PublicAPIUsagePlan',
    'PrivateAPIUsagePlan',
    'LoggingKmsKey',
    'CodeDeployServiceRole',
    'JWKSBucketRole'
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

  it('BasicFunction has timeout of 40 seconds', () => {
    const globals = template['Globals'] as Record<string, Record<string, unknown>>
    expect(globals['Function']?.['Timeout']).toBe(40)
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
    'IpvCoreBackApiKeyId'
  ]

  it.each(expectedOutputs)('has output: %s', (output) => {
    const result = cfnOutputSchema.safeParse(outputs[output])
    expect(
      result.success,
      `Output ${output} failed validation: ${JSON.stringify(result.error?.issues)}`
    ).toBe(true)
  })
})

describe('template.yaml kms', () => {
  it('LoggingKmsKey has key rotation enabled', () => {
    const props = resources['LoggingKmsKey']?.['Properties'] as Record<string, unknown>
    expect(props['EnableKeyRotation']).toBe(true)
  })
})

describe('template.yaml api gateway throttling', () => {
  it.each(['PublicAPI', 'PrivateAPI'])(
    '%s has throttling configured on method settings',
    (apiName) => {
      const props = resources[apiName]?.['Properties'] as Record<string, unknown>
      const methodSettings = props['MethodSettings'] as Record<string, unknown>[]
      const setting = methodSettings[0]!
      expect(setting['ThrottlingRateLimit']).toBe(200)
      expect(setting['ThrottlingBurstLimit']).toBe(400)
    }
  )
})

describe('template.yaml production data trace', () => {
  it.each(['PublicAPI', 'PrivateAPI'])('%s disables DataTraceEnabled in production', (apiName) => {
    const props = resources[apiName]?.['Properties'] as Record<string, unknown>
    const methodSettings = props['MethodSettings'] as Record<string, unknown>[]
    const dataTrace = methodSettings[0]!['DataTraceEnabled'] as unknown[]
    // !If [IsProduction, false, true] — first branch (production) must be false
    expect(dataTrace).toEqual(expect.arrayContaining([false]))
  })
})

describe('template.yaml JWKSBucketRole IAM policy', () => {
  const props = resources['JWKSBucketRole']?.['Properties'] as Record<string, unknown>
  const policy = (props['Policies'] as Record<string, unknown>[])[0]!
  const statements = (policy['PolicyDocument'] as Record<string, unknown>)['Statement'] as Record<
    string,
    unknown
  >[]
  const statement = statements[0]!

  it('allows only s3:Get* actions', () => {
    expect(statement['Action']).toEqual(['s3:Get*'])
    expect(statement['Effect']).toBe('Allow')
  })

  it('restricts resource to the JWKS bucket object', () => {
    const resource = statement['Resource'] as string[]
    expect(resource[0]).toContain('govuk-one-login-ob-published-keys-')
    expect(resource[0]).toContain('/jwks.json')
  })

  it('is assumed only by apigateway', () => {
    const assume = (props['AssumeRolePolicyDocument'] as Record<string, unknown>)[
      'Statement'
    ] as Record<string, unknown>[]
    const principal = assume[0]!['Principal'] as Record<string, string>
    expect(principal['Service']).toBe('apigateway.amazonaws.com')
  })
})

describe('template.yaml LoggingKmsKey policy', () => {
  const keyPolicy = (resources['LoggingKmsKey']?.['Properties'] as Record<string, unknown>)[
    'KeyPolicy'
  ] as Record<string, unknown>
  const statements = keyPolicy['Statement'] as Record<string, unknown>[]

  it('grants CloudWatch Logs service principal encrypt/decrypt permissions', () => {
    const logsStatement = statements.find((s) =>
      (s['Principal'] as Record<string, string>)['Service']?.includes('logs.')
    )
    expect(logsStatement).toBeDefined()
    const actions = logsStatement!['Action'] as string[]
    expect(actions).toEqual(
      expect.arrayContaining(['kms:Encrypt*', 'kms:Decrypt*', 'kms:GenerateDataKey*'])
    )
  })

  it('CloudWatch Logs grant is scoped to account log ARNs via condition', () => {
    const logsStatement = statements.find((s) =>
      (s['Principal'] as Record<string, string>)['Service']?.includes('logs.')
    )
    const condition = logsStatement!['Condition'] as Record<string, unknown>
    expect(condition).toHaveProperty('ArnLike')
    const arnLike = condition['ArnLike'] as Record<string, unknown>
    expect(arnLike['kms:EncryptionContext:aws:logs:arn']).toBeDefined()
  })
})

describe('template.yaml BasicFunction VPC config', () => {
  it('BasicFunction has VpcConfig with SecurityGroupIds and SubnetIds', () => {
    const props = resources['BasicFunction']?.['Properties'] as Record<string, unknown>
    const vpcConfig = props['VpcConfig'] as Record<string, unknown>
    expect(vpcConfig).toHaveProperty('SecurityGroupIds')
    expect(vpcConfig).toHaveProperty('SubnetIds')
  })
})

describe('template.yaml canary alarms', () => {
  it('BasicFunctionCanaryErrors has UseCanaryDeploymentAlarms condition', () => {
    const alarm = resources['BasicFunctionCanaryErrors']!
    expect(alarm['Condition']).toBe('UseCanaryDeploymentAlarms')
  })

  it('BasicFunctionCanary5xxErrors has UseCanaryDeploymentAlarms condition', () => {
    const alarm = resources['BasicFunctionCanary5xxErrors']!
    expect(alarm['Condition']).toBe('UseCanaryDeploymentAlarms')
  })

  it('BasicFunction deployment preference alarms reference canary alarms', () => {
    const props = resources['BasicFunction']?.['Properties'] as Record<string, unknown>
    const deploymentPref = props['DeploymentPreference'] as Record<string, unknown>
    expect(deploymentPref).toHaveProperty('Alarms')
  })

  it.each(['BasicFunctionCanaryErrors', 'BasicFunctionCanary5xxErrors'])(
    '%s has TreatMissingData set to notBreaching',
    (alarmName) => {
      const props = resources[alarmName]!['Properties'] as Record<string, unknown>
      expect(props['TreatMissingData']).toBe('notBreaching')
      expect(props['ComparisonOperator']).toBe('GreaterThanOrEqualToThreshold')
    }
  )

  it('BasicFunctionCanaryErrors monitors Lambda Errors metric', () => {
    const props = resources['BasicFunctionCanaryErrors']!['Properties'] as Record<string, unknown>
    expect(props['Namespace']).toBe('AWS/Lambda')
    expect(props['MetricName']).toBe('Errors')
  })

  it('BasicFunctionCanary5xxErrors monitors API Gateway 5XXError metric', () => {
    const props = resources['BasicFunctionCanary5xxErrors']!['Properties'] as Record<
      string,
      unknown
    >
    expect(props['Namespace']).toBe('AWS/ApiGateway')
    expect(props['MetricName']).toBe('5XXError')
  })
})

describe('template.yaml LambdaErrors alarm', () => {
  const props = resources['LambdaErrors']?.['Properties'] as Record<string, unknown>

  it('has AlarmsEnabled condition', () => {
    expect(resources['LambdaErrors']?.['Condition']).toBe('AlarmsEnabled')
  })

  it('monitors Lambda Errors metric', () => {
    expect(props['Namespace']).toBe('AWS/Lambda')
    expect(props['MetricName']).toBe('Errors')
  })

  it('has TreatMissingData set to notBreaching', () => {
    expect(props['TreatMissingData']).toBe('notBreaching')
    expect(props['ComparisonOperator']).toBe('GreaterThanThreshold')
  })

  it('has AlarmActions and OKActions configured', () => {
    expect(props['AlarmActions']).toBeDefined()
    expect(props['OKActions']).toBeDefined()
  })
})

describe('template.yaml APIGW5XXErrors alarm', () => {
  const props = resources['APIGW5XXErrors']?.['Properties'] as Record<string, unknown>

  it('has AlarmsEnabled condition', () => {
    expect(resources['APIGW5XXErrors']?.['Condition']).toBe('AlarmsEnabled')
  })

  it('has TreatMissingData set to notBreaching', () => {
    expect(props['TreatMissingData']).toBe('notBreaching')
    expect(props['ComparisonOperator']).toBe('GreaterThanThreshold')
  })

  it('has AlarmActions and OKActions configured', () => {
    expect(props['AlarmActions']).toBeDefined()
    expect(props['OKActions']).toBeDefined()
  })

  it('aggregates metrics across PublicAPI and PrivateAPI', () => {
    const metrics = props['Metrics'] as Record<string, unknown>[]
    const metricIds = metrics.map((m) => m['Id'])
    expect(metricIds).toContain('m1')
    expect(metricIds).toContain('m2')
    const apiNames = metrics
      .filter((m) => m['MetricStat'])
      .map(
        (m) =>
          ((m['MetricStat'] as Record<string, unknown>)['Metric'] as Record<string, unknown>)[
            'Dimensions'
          ]
      )
      .flat() as Record<string, string>[]
    const names = apiNames
      .filter((d) => d['Name'] === 'ApiName')
      .map((d) => d['Value'])
      .filter((v): v is string => v !== undefined)
    expect(names.some((n) => n.includes('PublicAPI'))).toBe(true)
    expect(names.some((n) => n.includes('PrivateAPI'))).toBe(true)
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
    const envVars = (
      globals['Function']?.['Environment'] as Record<string, Record<string, unknown>>
    )?.['Variables']
    const schema = z.object({
      AWS_LAMBDA_EXEC_WRAPPER: z.string(),
      AWS_STACK_NAME: z.unknown(),
      ENVIRONMENT: z.unknown(),
      PARAMETER_PREFIX: z.unknown(),
      POWERTOOLS_LOG_LEVEL: z.string(),
      POWERTOOLS_METRICS_NAMESPACE: z.unknown()
    })
    expect(schema.safeParse(envVars).success).toBe(true)
  })
})
