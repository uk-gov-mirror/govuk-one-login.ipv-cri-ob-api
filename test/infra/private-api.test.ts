import { loadTemplate, openApiSchema } from './helpers'
import { describe, expect, it } from 'vitest'

const template = loadTemplate('private-api.yaml')

const paths = template['paths'] as Record<string, Record<string, unknown>>

describe('private-api.yaml structure', () => {
  it('is a valid OpenAPI 3.x document', () => {
    expect(openApiSchema.safeParse(template).success).toBe(true)
  })

  it('has title', () => {
    const info = template['info'] as Record<string, string>
    expect(info['title']).toBe('Open Banking Credential Issuer Private API')
  })
})

describe('private-api.yaml paths', () => {
  const expectedPaths = ['/basic-function', '/authorization', '/session']

  it.each(expectedPaths)('has path: %s', (path) => {
    expect(paths).toHaveProperty(path)
  })

  it('/basic-function has POST with aws_proxy integration', () => {
    const post = paths['/basic-function']?.['post'] as Record<string, unknown>
    const integration = post['x-amazon-apigateway-integration'] as Record<string, string>
    expect(integration['type']).toBe('aws_proxy')
  })

  it('/authorization has GET method', () => {
    expect(paths['/authorization']).toHaveProperty('get')
  })

  it('/session has POST method', () => {
    expect(paths['/session']).toHaveProperty('post')
  })
})

describe('private-api.yaml components', () => {
  const components = template['components'] as Record<string, Record<string, unknown>>

  it('defines SessionHeader parameter', () => {
    expect(components['parameters']).toHaveProperty('SessionHeader')
  })

  it('defines required schemas', () => {
    const schemas = components['schemas']
    expect(schemas).toHaveProperty('Authorization')
    expect(schemas).toHaveProperty('AuthorizationResponse')
    expect(schemas).toHaveProperty('Error')
    expect(schemas).toHaveProperty('Session')
  })
})

describe('private-api.yaml request validators', () => {
  const validators = template['x-amazon-apigateway-request-validators'] as Record<string, unknown>

  it('defines Validate both', () => {
    expect(validators).toHaveProperty('Validate both')
  })

  it('defines Validate Param only', () => {
    expect(validators).toHaveProperty('Validate Param only')
  })
})
