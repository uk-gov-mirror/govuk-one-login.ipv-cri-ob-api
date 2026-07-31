# Plugin Layer Authoring Guide.md

Step-by-step guide for implementing a plugin for a new consumer of the `thirdparty-token` nested stack.

---

## 1. Implement the plugin

Create a file at `src/<your-plugin-name>/<your-plugin-name>.ts`. This file is the source for the Lambda Layer that the `ThirdPartyAsyncToken` lambda loads at runtime via dynamic import — it is not bundled into the lambda itself.

The plugin name becomes the value of `THIRDPARTY_TOKEN_PLUGIN_NAME` and maps directly to the layer filename.

```typescript
import type {
  PluginInput,
  ThirdPartyTokenPlugin,
  ThirdPartyTokenRequestConfig,
  ThirdPartyTokenResponse
} from '@src/async-token/plugin-api/token-plugin'

import { z } from 'zod'

const PLUGIN_NAME = 'my-token-plugin'

// Validate the SSM profile config your plugin expects
const tokenProfileSSMSchema = z.object({
  'client-id': z.string().min(1),
  'client-secret': z.string().min(1),
  'endpoint-url': z.url()
  // add any other fields your token endpoint requires
})

const createMyThirdPartyTokenPlugin = (): ThirdPartyTokenPlugin => ({
  // Identifies this plugin. Must match THIRDPARTY_TOKEN_PLUGIN_NAME exactly —
  // used to derive the SSM config path and the DynamoDB token key.
  name: PLUGIN_NAME,

  // HTTP status codes from the token endpoint that should fire an alert metric.
  // Requests must never be retried for these codes (e.g. bad credentials).
  alertStatusCodes: [401, 403],

  // Called once per profile on each scheduled invocation before buildTokenRequest.
  // Validates the raw SSM profile config and throws if required fields are missing.
  // Throwing here prevents a bad config from reaching the HTTP call.
  parseConfigProfile: (config) => tokenProfileSSMSchema.parse(config),

  // Constructs the HTTP request sent to the third-party token endpoint.
  // Receives the validated profile config via input.config (already parsed by parseConfigProfile).
  // Must return endpointUrl, headers, body, and timeoutMs.
  buildTokenRequest: (input: PluginInput): ThirdPartyTokenRequestConfig => {
    const config = tokenProfileSSMSchema.parse(input.config)
    return {
      endpointUrl: config['endpoint-url'],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config['client-id'],
        client_secret: config['client-secret']
      }).toString(),
      timeoutMs: 10_000
    }
  },

  // Parses the raw response body string from the token endpoint into { tokenValue }.
  // Return undefined on any parse failure — the update service treats this as a failed refresh
  // and will preserve the existing token (or clear it if already expired).
  mapResponse: (responseBody): ThirdPartyTokenResponse | undefined => {
    try {
      const parsed = JSON.parse(responseBody) as { access_token?: string }
      if (!parsed.access_token) return undefined
      return { tokenValue: parsed.access_token }
    } catch {
      return undefined
    }
  },

  // Final validation of the extracted token value before it is written to DynamoDB.
  // Return false to reject the token and treat the refresh as failed.
  // Validation logic depends on the token format — implement based on what the third party returns:
  //   JWT:           inspect header fields (alg, typ)
  //   UUID:          z.uuid().safeParse(tokenResponse.tokenValue).success
  //   opaque string: tokenResponse.tokenValue.length > 0
  //   unknown/none:  () => true  (if the third party gives no inspectable structure)
  isTokenValid: (tokenResponse) => tokenResponse.tokenValue.length > 0
})

// Required — the loader calls createPlugin() by this exact name
export const createPlugin = createMyThirdPartyTokenPlugin
```

### ThirdPartyTokenPlugin contract

| Method / field       | Purpose                                                                                  |
|----------------------|------------------------------------------------------------------------------------------|
| `name`               | Must match `THIRDPARTY_TOKEN_PLUGIN_NAME` exactly                                        |
| `alertStatusCodes`   | HTTP status codes that fire an alert metric and must never be retried                    |
| `parseConfigProfile` | Validates the SSM profile config — throw (e.g. zod) if required fields are missing      |
| `buildTokenRequest`  | Constructs the HTTP request (URL, headers, body, timeout) from the validated profile config |
| `mapResponse`        | Parses the raw response body string → `{ tokenValue }`, returns `undefined` on failure  |
| `isTokenValid`       | Final validation of the extracted token value before it is stored                       |

---

## 2. Add the Makefile build target

SAM does not support `BuildMethod: esbuild` for `AWS::Serverless::LayerVersion`, so esbuild is invoked via `make`. Add a target to `Makefile` at the project root to bundle the plugin source into the layer artifact:

```makefile
.PHONY: build-MyTokenPluginLayer

build-MyTokenPluginLayer:
	npm ci --omit=dev
	./node_modules/.bin/esbuild src/<your-plugin-name>/<your-plugin-name>.ts \
		--bundle \
		--platform=node \
		--target=node24 \
		--format=esm \
		--out-extension:.js=.mjs \
		--outdir="$(ARTIFACTS_DIR)/nodejs" \
		--external:@aws-sdk/*
```

The output filename is derived from the entry point filename. SAM writes to `$(ARTIFACTS_DIR)/nodejs/my-token-plugin.mjs`, which must match `THIRDPARTY_TOKEN_PLUGIN_NAME` exactly.

> Bundle `zod` and any non-AWS-SDK dependencies. Do **not** rely on the lambda's `node_modules` — ESM modules loaded from `/opt/nodejs/` cannot resolve bare specifiers from `/var/task/node_modules/`.

---

## 3. Add the layer resource to the parent template

```yaml
MyTokenPluginLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: !Sub "${AWS::StackName}-my-token-plugin"
    Description: "My token plugin - provides createPlugin() for the ThirdPartyAsyncToken lambda"
    ContentUri: ../
    CompatibleRuntimes:
      - nodejs24.x
    CompatibleArchitectures:
      - arm64
  Metadata:
    BuildMethod: makefile
    BuildArchitecture: arm64
```

`ContentUri: ../` points to the project root so SAM copies the full project (including `src`) to the build directory where `make` runs.

---

## 4. Wire the layer into the nested stack

Pass the layer ARN and plugin name as parameters to the `ThirdPartyToken` nested stack:

```yaml
ThirdPartyToken:
  Type: AWS::Serverless::Application
  Properties:
    Location: ./thirdparty-token.yaml   # or SAR ApplicationId once published
    Parameters:
      ThirdPartyTokenPluginLayerArn: !Ref MyTokenPluginLayer
      ThirdPartyTokenPluginName: my-token-plugin
      # ... other required parameters (ParentStackName, Environment, VpcStackName, etc.)
```

---

## 5. Add SSM parameters

The nested stack reads config from SSM under `/${stack-name}/${pluginName}/`. Two levels are required:

**Plugin-level config** (read once at cold start):
```
/${stack-name}/my-token-plugin/config
```

| Key                            | Example value | Description                             |
|--------------------------------|---------------|-----------------------------------------|
| `enabledProfiles`              | `STUB\|UAT`   | Pipe-separated list of profile prefixes |
| `maxAllowedLifetimeSeconds`    | `3600`        | Maximum token lifetime                  |
| `tokenExpirationWindowSeconds` | `300`         | How early to refresh before expiry      |

Constraints enforced at cold start:
- `itemTtlSeconds` (`maxAllowedLifetimeSeconds - tokenExpirationWindowSeconds`) must be ≥ 300
- `tokenExpirationWindowSeconds` must be ≥ 60
- `tokenExpirationWindowSeconds` must be < `itemTtlSeconds`

**Profile-level config** (read per-profile on each scheduled invocation):
```
/${stack-name}/my-token-plugin/profiles/${PROFILE_NAME}
```

Contains the fields your `parseConfigProfile` / `buildTokenRequest` expect (e.g. `client-id`, `client-secret`, `endpoint-url`). One path per entry in `enabledProfiles`.

---

## 6. Verify the filename convention

The loader uses `THIRDPARTY_TOKEN_PLUGIN_NAME` verbatim as the module filename — no transformation is applied:

| `THIRDPARTY_TOKEN_PLUGIN_NAME` | Layer filename        | Runtime path                      |
|--------------------------------|-----------------------|-----------------------------------|
| `ob-token-plugin`              | `ob-token-plugin.mjs` | `/opt/nodejs/ob-token-plugin.mjs` |
| `my-token-plugin`              | `my-token-plugin.mjs` | `/opt/nodejs/my-token-plugin.mjs` |

The Makefile target name (`build-MyTokenPluginLayer`) controls what SAM names the output file. Ensure `THIRDPARTY_TOKEN_PLUGIN_NAME` matches the output filename exactly (without the `.mjs` extension).

---

## 7. Deployment validation

No extra steps needed. The bootstrap pattern provides automatic validation on every deployment:

1. `loadPlugin()` — fails fast if the layer is missing or `createPlugin` is not exported
2. `updateForAllEnabledProfiles(true)` — fetches a real token for every enabled profile

If either throws, the canary alarm fires and CodeDeploy rolls back before live traffic is shifted.

---

## Checklist

- [ ] Plugin file exports `createPlugin` (exact name)
- [ ] `plugin.name` matches `THIRDPARTY_TOKEN_PLUGIN_NAME` exactly
- [ ] Makefile target named `build-<LayerLogicalId>`
- [ ] Layer resource in parent template with `BuildMethod: makefile`
- [ ] `ThirdPartyTokenPluginLayerArn` and `ThirdPartyTokenPluginName` passed to nested stack
- [ ] SSM `/config` path created with `enabledProfiles`, `maxAllowedLifetimeSeconds`, `tokenExpirationWindowSeconds`
- [ ] SSM `/profiles/${PROFILE_NAME}` path created for each enabled profile
- [ ] `THIRDPARTY_TOKEN_PLUGIN_NAME` matches the layer output filename exactly (without `.mjs`)
