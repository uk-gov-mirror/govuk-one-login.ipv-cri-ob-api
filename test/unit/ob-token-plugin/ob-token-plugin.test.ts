import { describe, expect, it, vi } from 'vitest'

vi.mock('@govuk-one-login/cri-logger', () => ({
  logger: { error: vi.fn() }
}))

import { createPlugin } from '@src/ob-token-plugin/ob-token-plugin'

describe('createObThirdPartyTokenPlugin', () => {
  const plugin = createPlugin()

  describe('buildTokenRequest', () => {
    it('builds correct request from flat config', () => {
      const result = plugin.buildTokenRequest({
        config: {
          'client-id': 'myId',
          'client-secret': 'mySecret', // pragma: allowlist secret
          'endpoint-url': 'https://auth.example.com/token',
          'grant-type': 'client_credentials',
          scope: 'accounts'
        },
        tokenPrefix: 'STUB'
      })

      expect(result.endpointUrl).toBe('https://auth.example.com/token')
      expect(result.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
      expect(result.body).toContain('client_id=myId')
      expect(result.body).toContain('client_secret=mySecret')
      expect(result.body).toContain('grant_type=client_credentials')
      expect(result.body).toContain('scope=accounts')
    })

    it('throws for each missing required key', () => {
      const requiredKeys = ['client-id', 'client-secret', 'endpoint-url', 'grant-type', 'scope']
      for (const missingKey of requiredKeys) {
        const config = Object.fromEntries(
          requiredKeys.filter((k) => k !== missingKey).map((k) => [k, 'value'])
        )
        // endpoint-url needs a valid URL for other cases
        if (missingKey !== 'endpoint-url') {
          config['endpoint-url'] = 'https://example.com/token'
        }
        expect(() => plugin.buildTokenRequest({ config, tokenPrefix: 'STUB' })).toThrow()
      }
    })
  })

  describe('mapResponse', () => {
    const maxLifetimeSeconds = 3600
    const expirationWindowSeconds = 300

    const validBody = (expires_in = 3600) =>
      JSON.stringify({ access_token: 'my-jwt-token', expires_in, scope: 'accounts', token_type: 'bearer' })

    it('extracts access_token from valid response', () => {
      expect(plugin.mapResponse(validBody(), maxLifetimeSeconds, expirationWindowSeconds)).toEqual({
        tokenValue: 'my-jwt-token'
      })
    })

    it('returns undefined for invalid JSON', () => {
      expect(plugin.mapResponse('not json', maxLifetimeSeconds, expirationWindowSeconds)).toBeUndefined()
    })

    it('returns undefined when access_token is missing', () => {
      expect(
        plugin.mapResponse(
          JSON.stringify({ expires_in: 3600, scope: 'accounts', token_type: 'bearer' }),
          maxLifetimeSeconds,
          expirationWindowSeconds
        )
      ).toBeUndefined()
    })

    it('returns undefined when token_type is missing', () => {
      expect(
        plugin.mapResponse(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, scope: 'accounts' }),
          maxLifetimeSeconds,
          expirationWindowSeconds
        )
      ).toBeUndefined()
    })

    it('returns undefined when scope is missing', () => {
      expect(
        plugin.mapResponse(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'bearer' }),
          maxLifetimeSeconds,
          expirationWindowSeconds
        )
      ).toBeUndefined()
    })

    it('returns undefined when expires_in is not greater than expirationWindowSeconds', () => {
      expect(plugin.mapResponse(validBody(0), maxLifetimeSeconds, expirationWindowSeconds)).toBeUndefined()
    })

    it('returns undefined when expires_in equals expirationWindowSeconds', () => {
      expect(
        plugin.mapResponse(validBody(expirationWindowSeconds), maxLifetimeSeconds, expirationWindowSeconds)
      ).toBeUndefined()
    })

    it('returns undefined when expires_in is below maxLifetimeSeconds', () => {
      expect(
        plugin.mapResponse(validBody(maxLifetimeSeconds - 1), maxLifetimeSeconds, expirationWindowSeconds)
      ).toBeUndefined()
    })

    it('returns token when expires_in equals maxLifetimeSeconds', () => {
      expect(
        plugin.mapResponse(validBody(maxLifetimeSeconds), maxLifetimeSeconds, expirationWindowSeconds)
      ).toEqual({ tokenValue: 'my-jwt-token' })
    })
  })

  // Temporarily testing a uuid
  describe('isTokenValid', () => {
    it('returns true for a valid UUID', () => {
      expect(plugin.isTokenValid({ tokenValue: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true)
    })

    it('returns false for a non-UUID token', () => {
      expect(plugin.isTokenValid({ tokenValue: 'some-token' })).toBe(false)
    })
  })

  describe('parseConfigProfile', () => {
    it('returns parsed config for valid input', () => {
      const result = plugin.parseConfigProfile({
        'client-id': 'id',
        'client-secret': 'secret', // pragma: allowlist secret
        'endpoint-url': 'https://example.com/token',
        'grant-type': 'client_credentials',
        scope: 'accounts'
      })
      expect(result['client-id']).toBe('id')
    })

    it('throws when a required key is missing', () => {
      expect(() => plugin.parseConfigProfile({ 'client-id': 'id' })).toThrow()
    })

    it('throws when endpoint-url is not a valid URL', () => {
      expect(() =>
        plugin.parseConfigProfile({
          'client-id': 'id',
          'client-secret': 'secret', // pragma: allowlist secret
          'endpoint-url': 'not-a-url',
          'grant-type': 'client_credentials',
          scope: 'accounts'
        })
      ).toThrow()
    })
  })
})
