
# OAuth to Endpoint Profile mapping
To enable differentiating between configurations needed for connecting to STUBS and those from the "THIRD-PARTY", we have also implemented the test data strategy [Test Data Strategy](https://govukverify.atlassian.net/wiki/spaces/DID/pages/3780116695/E2E+Test+Data+Strategy+Review).
This requires mapping a number of OAuth clientIds to profiles and selecting the correct values for each dynamically at runtime.

In OpenBanking there is an improved mechanism in place for managing profiles, saved in the SSM Parameter store, in preparation for a switch to APP config.

The OAuth clientId to Profile mappings for OpenBanking CRI live in `client-config-profile-resolver.ts` to remain consistent with the Java based CRI using the same profile names, however the SSM layout is substantially different.
We are using a namespace-based approach to manage the profiles for each endpoint connection.

## SSM Parameter Layout

### Config

The parameter controlling the enabling of profiles lives under:
`/{stack-name}/{namespace}/config/enabledProfiles`

where `enabledProfiles` is a pipe-delimited list of active profiles, e.g. `STUB|UAT|LIVE`.

Example using namespace `ob_token_plugin`:
```
/{stack-name}/ob_token_plugin/config/enabledProfiles
```

### Profiles

Per-profile parameters live under:
`/{stack-name}/{namespace}/profiles/{PROFILE_NAME}/{param}`

Example using namespace `ob_token_plugin` with profile `STUB`:
```
/{stack-name}/ob_token_plugin/profiles/STUB/client-id
/{stack-name}/ob_token_plugin/profiles/STUB/client-secret
/{stack-name}/ob_token_plugin/profiles/STUB/endpoint-url
/{stack-name}/ob_token_plugin/profiles/STUB/scope
/{stack-name}/ob_token_plugin/profiles/STUB/grant-type
```

The same parameters exist under each profile (`STUB`, `UAT`, `LIVE`) with values appropriate to each route.

The namespace is chosen to represent the endpoint connection (e.g. `ob_token_plugin`, `ob_account_api`), not tied to any specific implementation pattern.

## Runtime Usage

SSM reads are abstracted behind a `ConfigProvider` interface:

```typescript
interface ConfigProvider {
  getConfig: (parameterPath: string) => Promise<Record<string, string>>
}
```

The concrete implementation `createSsmConfigProvider` uses `@aws-lambda-powertools/parameters/ssm` to recursively fetch and cache parameters at a given path. This abstraction is designed to allow swapping SSM for APP config later.

Callers pass the profile path (e.g. `/{stack-name}/{namespace}/profiles/STUB`) to `getConfig`, which returns the flat key-value map. The plugin then validates the result with zod before use.

## How to implement

### 1. Resolve the profile name

Use `getConfigProfileNameFromClientId` from `src/common/util/client-config-profile-resolver.ts` to map the incoming OAuth `clientId` to a profile name:

```typescript
import { getConfigProfileNameFromClientId } from '@common/util/client-config-profile-resolver'

const profileName = getConfigProfileNameFromClientId(clientId) // e.g. 'STUB'
```

### 2. Build the SSM path and fetch config

The config root comes from an environment variable (typically resolving to `/{stack-name}`). Use `ssmConfigProvider` from `src/common/client/ssm-config-provider.ts`:

```typescript
import { ssmConfigProvider } from '@common/client/ssm-config-provider'

const configRoot = requireEnv('MY_ENDPOINT_SSM_CONFIG_ROOT')
const namespace = 'my_endpoint_namespace'

const config = await ssmConfigProvider.getConfig(
  `${configRoot}/${namespace}/profiles/${profileName}`
)
```

### 3. Validate with zod

Define a schema for the expected profile parameters and validate:

```typescript
import { z } from 'zod'

const myEndpointProfileSchema = z.object({
  'client-id': z.string().min(1),
  'client-secret': z.string().min(1),
  'endpoint-url': z.url(),
  // ... other params as needed
})

const validated = myEndpointProfileSchema.parse(config)
```

### 4. Use the config to call the endpoint

Use the validated config values to make the endpoint call.

### 5. Set up SSM parameters

Ensure parameters exist in SSM for each enabled profile under your namespace, following the layout described in [SSM Parameter Layout](#ssm-parameter-layout) above.

### 6. IAM permissions

The lambda requires `ssm:GetParametersByPath` (with decrypt) on the relevant path, e.g.:
```
arn:aws:ssm:{region}:{account}:parameter/{stack-name}/{namespace}/*
```

### Reference implementations

- `src/common/client/config-provider.ts` — `ConfigProvider` interface
- `src/common/client/ssm-config-provider.ts` — SSM implementation
- `src/common/util/client-config-profile-resolver.ts` — clientId → profile mapping
- `src/thirdparty-async-token-plugin-ecospend/plugin/ob-token-plugin.ts` — zod schema and profile parsing example
- `src/thirdparty-async-token-plugin-api/plugin-api/token-plugin-config.ts` — reading config (enabledProfiles) from SSM

### Note on AppConfig compatibility

The current interface assumes a path-based lookup, which maps naturally to SSM's recursive parameter fetching. AppConfig uses a different model (application → environment → configuration profile) and returns a single document rather than hierarchical parameters. A future AppConfig implementation would need either a convention to derive application/environment/profile from the path string, or a richer input type beyond a single path string. The return type (`Record<string, string>`) remains compatible — an AppConfig JSON document can be parsed into that shape.
