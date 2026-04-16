import { loadTemplate, openApiSchema } from './helpers'
import { describe, expect, it } from 'vitest'

const template = loadTemplate('public-api.yaml')

const paths = template['paths'] as Record<string, Record<string, unknown>>

describe('public-api.yaml structure', () => {
  it('is a valid OpenAPI 3.x document', () => {
    expect(openApiSchema.safeParse(template).success).toBe(true)
  })

  it('has title', () => {
    const info = template['info'] as Record<string, string>
    expect(info['title']).toBe('Open Banking Credential Issuer Public API')
  })
})

describe('public-api.yaml paths', () => {
  const expectedPaths = ['/health', '/.well-known/jwks.json', '/token']

  it.each(expectedPaths)('has path: %s', (path) => {
    expect(paths).toHaveProperty(path)
  })

  it('/health has GET with mock integration', () => {
    const get = paths['/health']?.['get'] as Record<string, unknown>
    const integration = get['x-amazon-apigateway-integration'] as Record<string, string>
    expect(integration['type']).toBe('mock')
  })

  it('/token has POST method', () => {
    expect(paths['/token']).toHaveProperty('post')
  })

  it('/.well-known/jwks.json has GET with S3 integration', () => {
    const get = paths['/.well-known/jwks.json']?.['get'] as Record<string, unknown>
    const integration = get['x-amazon-apigateway-integration'] as Record<string, string>
    expect(integration['type']).toBe('aws')
  })
})

describe('public-api.yaml components', () => {
  const components = template['components'] as Record<string, Record<string, unknown>>
  const schemas = components['schemas']

  it('defines required schemas', () => {
    expect(schemas).toHaveProperty('JWKSFile')
    expect(schemas).toHaveProperty('TokenResponse')
    expect(schemas).toHaveProperty('Error')
  })
})

describe('public-api.yaml request validators', () => {
  const validators = template['x-amazon-apigateway-request-validators'] as Record<string, unknown>

  it('defines Validate both', () => {
    expect(validators).toHaveProperty('Validate both')
  })

  it('defines Validate Param only', () => {
    expect(validators).toHaveProperty('Validate Param only')
  })
})
