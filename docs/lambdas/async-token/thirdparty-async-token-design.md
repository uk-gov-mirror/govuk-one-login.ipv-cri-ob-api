# Thirdparty Async Token — Operation & Design

## Purpose

Maintains a continuously valid third-party access token in DynamoDB, refreshed every minute by a scheduled Lambda. Other lambdas in the stack read the cached token via the consumer service without needing to manage token lifecycle themselves.

---

## Architecture

```
                                    ┌─────────────────────┐
                                    │ SSM Parameter Store │
                                    │ (plugin config +    │
                                    │  profile secrets)   │
                                    └─────────┬───────────┘
                                              │
┌──────────────┐    every 1 min    ┌──────────▼───────────┐    POST      ┌─────────────────┐
│  EventBridge │──────────────────▶│ ThirdPartyAsync      │─────────────▶│  Third-Party    │
│  Cron Rule   │                   │ TokenFunction        │◀─────────────│  Token Endpoint │
└──────────────┘                   └──────────┬───────────┘  response    └─────────────────┘
                                              │
                                              │ put/get/delete
                                              ▼
                                    ┌────────────────────┐
                                    │ DynamoDB           │
                                    │ thirdparty-token-  │
                                    │ table              │
                                    └─────────┬──────────┘
                                              │
                                              │ get
                                              ▼
                                    ┌────────────────────┐
                                    │ Consumer Lambdas   │
                                    │ (via retrieval     │
                                    │  service)          │
                                    └────────────────────┘
```

---

## Lambda Lifecycle

### Cold Start (Bootstrap)

On every cold start, before the handler is registered:

1. **Load plugin** — `await loadPlugin()` dynamically imports from the layer
2. **Load config** — `await createThirdPartyTokenPluginConfig()` fetches SSM config (enabled profiles, TTLs)
3. **Force update all profiles** — `await updateForAllEnabledProfiles(true)` fetches fresh tokens for every enabled profile

If any step fails, the Lambda invocation errors → canary alarm fires → CodeDeploy rolls back.

This guarantees that after a deployment, tokens are immediately valid.

### Scheduled Invocation (Every Minute)

The handler calls `updateForAllEnabledProfiles(false)`:

1. For each enabled profile (in parallel):
   - Fetch profile config from SSM
   - Plugin parses the config (`parseConfigProfile`)
   - Call `tokenUpdateService.updateTokenIfNeeded`
2. Individual profile failures are caught and logged — other profiles continue
3. After all complete, if any failed, throw an aggregated error (naming all failed prefixes)

---

## Token Update Logic

`tokenUpdateService.updateTokenIfNeeded(pluginInput, tokenForceUpdate)`:

```
┌─ Get existing token from DynamoDB
│
├─ Token exists AND not near expiry AND not a forced update
│   └─ Return: no update needed
│
├─ Otherwise, request new token:
│   ├─ Plugin builds request config (URL, headers, body, timeout)
│   ├─ POST to third-party endpoint
│   ├─ Validate response status (200)
│   ├─ Plugin maps response body → token value
│   ├─ Plugin validates token value
│   └─ Save token value to DynamoDB with TTL
│
└─ On failure:
    ├─ If existing token has expired → clear it from DynamoDB (prevent stale usage)
    └─ Return failure message (no throw — individual profile failure is caught by handler)
```

### Update Triggers

A token is refreshed when any of these are true:
- No existing token in DynamoDB (`noExistingToken`)
- Existing token is near expiry (`ttlExpired` — within `expirationWindowSeconds` of TTL)
- Force update requested (`tokenForceUpdate` — true on bootstrap, false on scheduled runs)

---

## Configuration

### SSM Parameters

Config is read from SSM at two levels:

**Plugin-level config** (read once at cold start):
```
/${THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT}/${pluginName}/config
```

Contains:
| Key | Description |
|-----|-------------|
| `enabledProfiles` | Pipe-separated list of profile prefixes (e.g. `STUB|UAT`) |
| `maxAllowedLifetimeSeconds` | Maximum token lifetime |
| `tokenExpirationWindowSeconds` | How early to refresh before expiry |

**Profile-level config** (read per-profile on each invocation):
```
/${THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT}/${pluginName}/profiles/${tokenPrefix}
```

Contains plugin-specific secrets (e.g. `client-id`, `client-secret`, `endpoint-url`). The plugin's `parseConfigProfile` validates and types this.

### Environment Variables

| Variable                                  | Source                   | Purpose                                                             |
|-------------------------------------------|--------------------------|---------------------------------------------------------------------|
| `THIRDPARTY_TOKEN_PLUGIN_NAME`            | CloudFormation parameter | Plugin name — used to derive layer module path and SSM config paths |
| `THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT` | CloudFormation           | Root SSM path prefix                                                |
| `THIRDPARTY_TOKEN_DYNAMO_TABLE_NAME`      | CloudFormation           | DynamoDB table for cached tokens                                    |
| `THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN`       | CloudFormation           | Forces canary deployment on layer updates                           |

---

## DynamoDB Token Storage

Table: `${ParentStackName}-thirdparty-token-table`

| Field        | Type                   | Description                                             |
|--------------|------------------------|---------------------------------------------------------|
| `id`         | String (partition key) | Token name: `${tokenPrefix}_token_${pluginName}`        |
| `tokenValue` | String                 | The cached access token                                 |
| `ttl`        | Number                 | Unix epoch seconds — DynamoDB TTL for automatic cleanup |

TTL is calculated as: `now + itemTtlSeconds` where `itemTtlSeconds = maxLifetimeSeconds - expirationWindowSeconds`.

---

## Token Consumer

Other lambdas read cached tokens via `ThirdPartyTokenRetrievalService`:

```typescript
const token = await tokenRetrievalService.retrieveTokenForConfigProfileName(profileName)
```

Returns:
- The token value if it exists and hasn't expired
- `undefined` if no token exists or TTL has passed

The consumer does **not** refresh tokens — it only reads. The async lambda is solely responsible for keeping tokens fresh.

---

## Error Handling

| Scenario                                  | Behaviour                                                                   |
|-------------------------------------------|-----------------------------------------------------------------------------|
| Bootstrap fails (cold start)              | Lambda invocation fails → canary alarm → rollback                           |
| Single profile fails during scheduled run | Logged, other profiles continue, aggregated error thrown after all complete |
| All profiles fail                         | Aggregated error thrown → Lambda error metric fires                         |
| Third-party returns non-200               | Token not updated, existing token preserved (unless expired)                |
| Third-party returns 401/403               | Alert metric logged (via `alertStatusCodes`)                                |
| Existing token expired AND refresh fails  | Expired token cleared from DynamoDB to prevent stale usage                  |
| Network timeout                           | Caught by `AbortSignal.timeout` + body read race                            |
| Response body read hangs                  | Separate `Promise.race` timeout on `response.text()`                        |

---

## Expiry & Refresh Timing

```
|◀────────────────── maxLifetimeSeconds (e.g. 3600s) ────────────────────▶|
|                                                                         |
|◀── itemTtlSeconds (e.g. 3300s) ────▶|◀── expirationWindow (e.g. 300s) ─▶|
|                                     |                                   |
token saved                     refresh triggered                    token expires
                                (near expiry)                        (DynamoDB TTL)
```

- Token is saved with `ttl = now + itemTtlSeconds`
- On next invocation, if `now > ttl - expirationWindowSeconds` → refresh
- If refresh fails, the token remains valid until DynamoDB TTL removes it
- If refresh fails AND token has passed its TTL → token is cleared immediately

---

## Infrastructure

### Resources (in `thirdparty-token.yaml`)

| Resource                                        | Type             | Purpose                 |
|-------------------------------------------------|------------------|-------------------------|
| `ThirdPartyAsyncTokenFunction`                  | Lambda           | Scheduled token refresh |
| `ThirdPartyAsyncTokenFunctionEventRule`         | EventBridge Rule | 1-minute cron trigger   |
| `ThirdPartyTokenTable`                          | DynamoDB Table   | Token cache with TTL    |
| `CanaryThirdPartyAsyncTokenFunctionErrorsAlarm` | CloudWatch Alarm | Canary deployment gate  |

### Deployment

- Canary deployment via `AutoPublishAlias` + `DeploymentPreference`
- EventBridge targets the `live` alias (not `$LATEST`)
- Provisioned concurrency on the `live` alias (when enabled)
- Bootstrap on cold start validates deployment before canary completes

### VPC

The lambda runs in protected subnets with access to:
- AWS services endpoint (SSM, DynamoDB)
- Internet (via NAT) for third-party token endpoint calls

---

## Module Structure

```
src/
  thirdparty-async-token-lambda/
    handler/thirdparty-async-token-lambda.ts   ← entry point, bootstrap, handler
    service/token-update-service.ts            ← token refresh logic + HTTP calls
    plugin-loader.ts                           ← dynamic import from layer

  thirdparty-async-token-plugin-api/
    plugin-api/token-plugin.ts                 ← ThirdPartyTokenPlugin interface
    plugin-api/token-plugin-config.ts          ← SSM config loading + validation

  thirdparty-async-token-common/
    client/token-repository.ts                 ← DynamoDB get/put/delete
    types/token-entity.ts                      ← TokenEntity type
    util/token-entity-util.ts                  ← expiry checks, naming helpers

  thirdparty-async-token-consumer/
    service/token-retrieval-service.ts         ← read-only token access for other lambdas

  thirdparty-async-token-plugin-ecospend/
    plugin/ob-token-plugin.ts                  ← OB plugin implementation (in layer)
```

---

## Security Considerations

- Profile configs in SSM contain secrets (`client-secret`) — never logged
- `pluginInput.config` must never be included in error messages or log output
- Only `error.message` is safe to log from caught errors
- Tokens are stored encrypted at rest (DynamoDB SSE with KMS)
- Lambda runs in VPC with restricted egress
