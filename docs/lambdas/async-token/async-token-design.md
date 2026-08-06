# Async Token — Operation & Design

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
                                              ▼
┌──────────────┐    every 1 min    ┌──────────────────────┐    POST      ┌─────────────────┐
│  EventBridge │──────────────────▶│ ThirdPartyAsync      │─────────────▶│  Third-Party    │
│  Cron Rule   │                   │ TokenFunction        │◀─────────────│  Token Endpoint │
└──────────────┘                   └──────────┬───────────┘  response    └─────────────────┘
                                              │
                                              │ put/get/delete
                                              ▼
                                    ┌────────────────────┐
                                    │ DynamoDB           │
                                    │ third-party-token- │
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
2. **Load config** — `thirdPartyTokenPluginConfig` is resolved via top-level await in `token-plugin-config.ts` on module import, fetching SSM config (enabled profiles, TTLs)
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

---

## Configuration

### Environment Variables

Set by CloudFormation at deploy time, these wire the Lambda to its plugin, config, and storage — enabling the same nested stack to serve any plugin without code changes.

| Variable                                  | Source                   | Purpose                                                             |
|-------------------------------------------|--------------------------|---------------------------------------------------------------------|
| `THIRDPARTY_TOKEN_PLUGIN_NAME`            | CloudFormation parameter | Plugin name — used to derive layer module path and SSM config paths |
| `THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT` | CloudFormation           | Root SSM path prefix                                                |
| `THIRDPARTY_TOKEN_DYNAMO_TABLE_NAME`      | CloudFormation           | DynamoDB table for cached tokens                                    |
| `THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN`       | CloudFormation           | Forces canary deployment on layer updates                           |

---

### SSM Parameters

Config is read from SSM at two levels:

**Plugin-level config** (read once at cold start):
```
${THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT}/${pluginName}/config
```

Contains:

| Key                              | Description                                                                 |
|----------------------------------|-----------------------------------------------------------------------------|
| `enabledProfiles`                | Pipe-separated list of profile prefixes (e.g. `STUB\|UAT`)                  |
| `tokenMaxAllowedLifetimeSeconds` | Token lifetime; stored directly as the item `ttl` (must be `<= expires_in`) |
| `tokenExpirationWindowSeconds`   | Lead time before expiry when the token becomes eligible for replacement     |
| `tokenExpirationPadSeconds`      | End-of-life buffer; consumers stop serving this many seconds before expiry  |

**Profile-level config** (read per-profile on each invocation):
```
/${THIRDPARTY_TOKEN_PLUGIN_SSM_CONFIG_ROOT}/${pluginName}/profiles/${tokenPrefix}
```

Contains plugin-specific secrets (e.g. `client-id`, `client-secret`, `endpoint-url`). The plugin's `parseConfigProfile` validates and types this.

`createThirdPartyTokenPluginConfig` parses the SSM values above (plus `pluginName` from `THIRDPARTY_TOKEN_PLUGIN_NAME`) into a typed `ThirdPartyTokenPluginConfig` at cold start.

## DynamoDB Token Storage

Table: `${ParentStackName}-third-party-token-table`

| Field        | Type                   | Description                                                                         |
|--------------|------------------------|-------------------------------------------------------------------------------------|
| `id`         | String (partition key) | Token name: `${tokenPrefix}-token-${pluginName}`                                    |
| `tokenValue` | String                 | The cached access token                                                             |
| `ttl`        | Number                 | Real expiry epoch seconds; DynamoDB auto-deletes the item at `ttl`                  |
| `pad`        | Number                 | `tokenExpirationPadSeconds` copied onto the item so consumers need no plugin config |

`ttl = now + tokenMaxAllowedLifetimeSeconds` — the token's real expiry. The replacement
window and consumer pad are applied as offsets from `ttl` at read time, never baked into it.

---

## Token Consumer

Other lambdas read cached tokens via `retrieveToken`:

```typescript
const token = await retrieveToken(configProfileName) // e.g ConfigProfileName: 'LIVE' | 'STUB' | 'UAT'
```

Returns the token value if it exists and `now < ttl - pad`, otherwise `undefined`. The consumer reads the `pad` stored on the item — it needs no plugin config and does not trigger replacement.

---

## Error Handling

| Scenario                                   | Behaviour                                                                                 |
|--------------------------------------------|-------------------------------------------------------------------------------------------|
| Bootstrap fails (cold start)               | Lambda invocation fails → canary alarm → rollback                                         |
| Single profile fails during scheduled run  | Logged, other profiles continue, aggregated error thrown after all complete               |
| All profiles fail                          | Aggregated error thrown → Lambda error metric fires                                       |
| Third-party returns non-200                | Token not updated, existing token preserved (unless expired)                              |
| Third-party returns 401/403                | Alert metric logged (via `alertStatusCodes`)                                              |
| Existing token expired AND refresh fails   | Expired token cleared from DynamoDB to prevent stale usage                                |
| Network timeout / response body read hangs | Single `AbortSignal.timeout` on `fetch()` covers the entire request (connect + body read) |

---

## Expiry & Replacement Timing

```
0                                    ttl - window            ttl-pad   ttl
|◀───────────── usable serving ─────────▶|                      |       |
|                                        |◀─────── window ─────▶|       |
|                                        |                      |◀ pad ▶|
token saved                        replacement            consumers    expiry
                                   eligible                stop serving (DynamoDB delete)

e.g. lifetime 3600s, window 300s, pad 30s → replaceable at 3300s, consumers stop at 3570s, expiry 3600s
```

- Item stored with `ttl = now + tokenMaxAllowedLifetimeSeconds` (real expiry) and `pad = tokenExpirationPadSeconds`
- If replacement fails, the token stays in DynamoDB until expired (within pad); only then is it cleared

---

## Infrastructure

### Resources (in `third-party-token.yaml`)

| Resource                                        | Type             | Purpose                 |
|-------------------------------------------------|------------------|-------------------------|
| `ThirdPartyAsyncTokenFunction`                  | Lambda           | Scheduled token refresh |
| `ThirdPartyAsyncTokenFunctionEventRule`         | EventBridge Rule | 1-minute cron trigger   |
| `ThirdPartyTokenTable`                          | DynamoDB Table   | Token cache with TTL    |
| `CanaryThirdPartyAsyncTokenFunctionErrorsAlarm` | CloudWatch Alarm | Canary deployment gate  |

---

## Module Structure

```
src/
  async-token/
    lambda/
      handler/async-token-lambda.ts              ← entry point, bootstrap, handler
      service/token-update-service.ts            ← token refresh logic + HTTP calls
      util/plugin-loader.ts                      ← reads THIRDPARTY_TOKEN_PLUGIN_NAME, imports /opt/nodejs/${pluginName}.mjs, calls createPlugin(), caches the result
    plugin-api/
      token-plugin.ts                            ← ThirdPartyTokenPlugin interface
      token-plugin-config.ts                     ← SSM config loading + validation
    common/
      client/token-repository.ts                 ← DynamoDB get/put/delete
      types/token-entity.ts                      ← TokenEntity type
      util/token-expiry.ts                       ← expiry checks
      util/token-naming.ts                       ← getThirdPartyTokenName
    consumer/
      token-retrieval.ts                         ← read-only token access for other lambdas

  ob-token-plugin/
    ob-token-plugin.ts                           ← OB plugin implementation (in layer)
```

---

## Security Considerations

- Profile configs in SSM contain secrets (`client-secret`) — never logged
- `pluginInput.config` must never be included in error messages or log output
- Only `error.message` is safe to log from caught errors
- Tokens are stored encrypted at rest (DynamoDB SSE with KMS)
- Lambda runs in VPC with restricted egress
