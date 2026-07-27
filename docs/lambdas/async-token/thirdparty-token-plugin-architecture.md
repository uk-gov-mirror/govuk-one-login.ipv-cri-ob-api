# Thirdparty Token Stack — Library & Plugin Design

## Problem

We want to:
1. **Decouple** the thirdparty-token nested stack from any specific plugin implementation
2. Allow consumers to provide **different plugins** (not just `ob_token_plugin`) without code changes to the nested stack
3. Enable **publishing** the thirdparty-token stack as a reusable library for other CRIs
4. Keep the **same `sam build` + `sam deploy` workflow** we use today

---

## Solution: Lambda Layer Plugin Injection

The plugin is built as a **Lambda Layer** in the parent stack and injected into the nested stack via a parameter. The nested stack has zero compile-time knowledge of any plugin.

### Architecture

```
Parent stack (template.yaml)
  ├── ObTokenPluginLayer (AWS::Serverless::LayerVersion)     ← built by parent
  │     └── /opt/nodejs/ob-token-plugin.mjs                  ← esbuild output
  └── ThirdPartyToken (nested stack)
        └── ThirdPartyAsyncTokenFunction
              Layers (effective at runtime):
                - DynatraceSecretLayer                        ← from Globals
                - ThirdPartyTokenPluginLayerArn              ← function-level, passed from parent
              Environment:
                - THIRDPARTY_TOKEN_PLUGIN_NAME: ob_token_plugin
                - THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN: <layer version ARN>
```

```
┌────────────────────────────────────────────────────────────────────────┐
│  Parent Stack (template.yaml)                                          │
│                                                                        │
│  ┌────────────────────────────────────────────┐                        │
│  │  ObTokenPluginLayer                        │                        │
│  │  (AWS::Serverless::LayerVersion)           │                        │
│  │                                            │                        │
│  │  /opt/nodejs/ob-token-plugin.mjs           │                        │
│  │    └── exports: createPlugin()             │                        │
│  └────────────────────┬───────────────────────┘                        │
│                       │ !Ref (ARN)                                     │
│                       ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  ThirdPartyToken (nested stack — thirdparty-token.yaml)           │ │
│  │                                                                   │ │
│  │  Parameters:                                                      │ │
│  │    ThirdPartyTokenPluginLayerArn ─────────────────────┐           │ │
│  │    ThirdPartyTokenPluginName: ob_token_plugin         │           │ │
│  │                                                       │           │ │
│  │  ┌──────────────────────────────────────────────────┐ │           │ │
│  │  │  ThirdPartyAsyncTokenFunction                    │ │           │ │
│  │  │                                                  │ │           │ │
│  │  │  Layers:                                         │ │           │ │
│  │  │    - DynatraceSecretLayer         (from Globals) │ │           │ │
│  │  │    - ThirdPartyTokenPluginLayerArn (from param)◀───┘           │ │
│  │  │                                                  │             │ │
│  │  │  Environment:                                    │             │ │
│  │  │    THIRDPARTY_TOKEN_PLUGIN_NAME: ob_token_plugin │             │ │
│  │  │    THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN: <arn>      │             │ │
│  │  │                                                  │             │ │
│  │  │  Code:                                           │             │ │
│  │  │    plugin-loader.ts → import(/opt/nodejs/...)    │             │ │
│  │  │    token-update-service.ts                       │             │ │
│  │  │    handler/thirdparty-async-token-lambda.ts      │             │ │
│  │  └──────────────────────────────────────────────────┘             │ │
│  │                                                                   │ │
│  │  ThirdPartyTokenTable (DynamoDB)                                  │ │
│  │  EventBridge Rule (1-min cron)                                    │ │
│  │  Canary Alarm                                                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```
At runtime, the lambda derives the module path from `THIRDPARTY_TOKEN_PLUGIN_NAME` (converting `snake_case` to `kebab-case`) and dynamically imports the plugin from `/opt/nodejs/<name>.mjs`, calling the standardised `createPlugin()` factory export.

---

## Plugin Layer Contract

Every plugin layer module **must** export a single factory function named `createPlugin` that returns a `ThirdPartyTokenPlugin`:

```typescript
// /opt/nodejs/ob-token-plugin.mjs (layer output)
export const createPlugin = (): ThirdPartyTokenPlugin => ({
  name: 'ob_token_plugin',
  alertStatusCodes: [401, 403],
  buildTokenRequest: (input) => { /* ... */ },
  isTokenValid: (response) => { /* ... */ },
  mapResponse: (body) => { /* ... */ },
  parseConfigProfile: (config) => { /* ... */ }
})
```

The standardised `createPlugin` name means:
- The loader doesn't need to know the plugin's internal name
- No naming convention to derive (no `create<Name>ThirdPartyTokenPlugin`)
- Any CRI can provide a layer with `createPlugin` and it works immediately

In this repo, the existing `createObThirdPartyTokenPlugin` function is re-exported:

```typescript
// src/thirdparty-async-token-plugin-ecospend/plugin/ob-token-plugin.ts
export const createObThirdPartyTokenPlugin = (): ThirdPartyTokenPlugin => ({ /* ... */ })

// Standard export for layer contract
export const createPlugin = createObThirdPartyTokenPlugin
```

### Plugin filename convention

The plugin loader derives the module path from `THIRDPARTY_TOKEN_PLUGIN_NAME`:

| Plugin name (snake_case) | Layer filename (kebab-case) | Runtime path                      |
|--------------------------|-----------------------------|-----------------------------------|
| `ob_token_plugin`        | `ob-token-plugin.mjs`       | `/opt/nodejs/ob-token-plugin.mjs` |
| `my_token_plugin`        | `my-token-plugin.mjs`       | `/opt/nodejs/my-token-plugin.mjs` |

This convention exists because CloudFormation has no string transform functions — the mapping happens in the plugin loader code.

---

## Plugin Loader

`plugin-loader.ts` lives in the lambda module. It dynamically imports the plugin from the layer at cold start:

```typescript
// src/thirdparty-async-token-lambda/plugin-loader.ts
import type { ThirdPartyTokenPlugin } from '@src/thirdparty-async-token-plugin-api/plugin-api/token-plugin'

import { requireEnv } from '@common/util/env'

interface PluginModule {
  createPlugin: () => ThirdPartyTokenPlugin
}

let cached: ThirdPartyTokenPlugin | undefined

export const loadPlugin = async (): Promise<ThirdPartyTokenPlugin> => {
  if (cached) return cached

  // Plugin names use snake_case (e.g. ob_token_plugin) but layer filenames
  // must be kebab-case per code conventions (e.g. ob-token-plugin.mjs).
  // CloudFormation has no string transform functions, so we derive the path here.
  const pluginName = requireEnv('THIRDPARTY_TOKEN_PLUGIN_NAME')
  const modulePath = `/opt/nodejs/${pluginName.replaceAll('_', '-')}.mjs`

  const mod = (await import(modulePath)) as PluginModule
  cached = mod.createPlugin()

  return cached
}
```

If the dynamic import fails or `createPlugin` is not exported, the error propagates at cold start — triggering the canary alarm and rollback. No try/catch is intentional: silent failure is worse than a loud crash.

Both the handler and the service use `await loadPlugin()` to obtain the plugin instance (cached after first call).

---

## Plugin Layer Dependencies

| Dependency                                       | Strategy                                                                                                                                                         |
|--------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `zod`                                            | Bundle into layer (required for schema parsing)                                                                                                                  |
| `@govuk-one-login/cri-logger`                    | **Bundle into layer** — ESM modules loaded from `/opt/nodejs/` cannot resolve packages from the lambda's `/var/task/node_modules/` due to Node module resolution |
| `@aws-sdk/*`                                     | Externalise — provided by the Lambda runtime                                                                                                                     |
| Type imports (`ThirdPartyTokenPlugin`, etc.)     | Erased at compile time — no concern                                                                                                                              |

---

## Infrastructure

### Parent Stack — Layer Resource

```yaml
ObTokenPluginLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    LayerName: !Sub "${AWS::StackName}-ob-token-plugin"
    Description: "Open Banking token plugin - provides createPlugin() for the ThirdPartyAsyncToken lambda"
    ContentUri: ../
    CompatibleRuntimes:
      - nodejs24.x
    CompatibleArchitectures:
      - arm64
  Metadata:
    BuildMethod: makefile
    BuildArchitecture: arm64
```

SAM does not support `BuildMethod: esbuild` for `AWS::Serverless::LayerVersion`. A `Makefile` at the project root runs esbuild directly:

```makefile
# Makefile (project root)
build-ObTokenPluginLayer:
	./node_modules/.bin/esbuild src/thirdparty-async-token-plugin-ecospend/plugin/ob-token-plugin.ts \
		--bundle \
		--platform=node \
		--target=node24 \
		--format=esm \
		--out-extension:.js=.mjs \
		--outdir="$(ARTIFACTS_DIR)/nodejs" \
		--external:@aws-sdk/*
```

`ContentUri: ../` points to the project root so SAM copies the full project (including `node_modules` and `src`) to the build directory where `make` runs.

The layer ARN is passed to the nested stack:

```yaml
ThirdPartyToken:
  Type: AWS::Serverless::Application
  Properties:
    Location: ./thirdparty-token.yaml
    Parameters:
      ThirdPartyTokenPluginLayerArn: !Ref ObTokenPluginLayer
```

### Nested Stack — Layer Attachment

```yaml
Parameters:
  ThirdPartyTokenPluginLayerArn:
    Type: String
    Description: "ARN of the Lambda Layer containing the token plugin module"

ThirdPartyAsyncTokenFunction:
  Properties:
    Layers:
      - !Ref ThirdPartyTokenPluginLayerArn
    Environment:
      Variables:
        # Forces AutoPublishAlias to publish a new function version when the layer changes.
        # Without this, layer updates may not trigger canary deployments — the Layers property
        # change alone is not a guaranteed trigger in SAM's internal diffing logic.
        THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN: !Ref ThirdPartyTokenPluginLayerArn
```

`DynatraceSecretLayer` remains in `Globals.Function.Layers`. SAM merges both — the function ends up with Dynatrace (from Globals) + plugin (from function-level).

---

## Layer Versioning & Canary Deployment Guarantee

### How layer updates propagate

`!Ref ObTokenPluginLayer` always resolves to the **latest published layer version ARN**. When plugin source changes:

1. `sam build` runs esbuild → produces a new `.mjs` with a different content hash
2. SAM detects the hash changed → uploads new artifact to S3
3. CloudFormation creates a new `AWS::Lambda::LayerVersion` (immutable — old versions remain available)
4. `!Ref` resolves to the incremented ARN (`:3` → `:4`)
5. Parent passes new ARN to nested stack
6. `THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN` env var changes → `AutoPublishAlias` publishes new function version
7. CodeDeploy canary deployment validates the new layer

### Why THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN is required

The `Layers` property change *should* trigger `AutoPublishAlias`, but this is implicit SAM behaviour — not explicitly guaranteed. If it doesn't fire, the new layer attaches to `$LATEST` but the `live` alias still points to the old version. Live traffic would never see the update, silently.

`THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN` makes this **explicit and guaranteed** — environment variable changes are core Lambda behaviour, not SAM-specific logic.

### Rollback behaviour

On canary failure, CodeDeploy rolls back:

1. The `live` alias reverts to the **previous function version**
2. That version's configuration still references the **old layer ARN** (`:3`)
3. Lambda layer versions are immutable — old version remains available and unchanged
4. No manual intervention needed

### Edge cases

| Scenario                                                          | Behaviour                                                                                                                              |
|-------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Plugin source unchanged, lambda code changes                      | Layer version stays same, env var unchanged, but function code changes → new version published via code change anyway                  |
| Plugin source changes, lambda code unchanged                      | Layer version increments → env var changes → new version published → canary validates new plugin                                       |
| Plugin source unchanged, only dependencies change (e.g. zod bump) | If esbuild output differs → new layer version → same cascade. If output identical → no change (correct)                                |
| `sam build` cache hit (identical esbuild output)                  | No new layer version → ARN unchanged → env var unchanged → no unnecessary deployment (correct)                                         |
| Layer build fails in `sam build`                                  | Build fails before deploy — nothing deployed, nothing changes                                                                          |
| Layer module has wrong export name                                | Cold start `loadPlugin()` calls `mod.createPlugin()` which is undefined → throws TypeError → bootstrap fails → canary alarm → rollback |
| Layer has incompatible dependency versions                        | Runtime error during bootstrap → canary alarm → rollback                                                                               |
| Multiple deploys with no plugin change                            | Layer ARN same → env var same → no spurious function version published (correct)                                                       |

---

## Testing Strategy

### Unit Testing — Plugin Loader

```typescript
// test/unit/thirdparty-async-token-lambda/plugin-loader.test.ts
describe('loadPlugin', () => {
  it('loads plugin from layer path derived from THIRDPARTY_TOKEN_PLUGIN_NAME', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'test_plugin')
    vi.mock('/opt/nodejs/test-plugin.mjs', () => ({
      createPlugin: () => mockPlugin
    }))

    const { loadPlugin } = await import('@src/thirdparty-async-token-lambda/plugin-loader')
    const plugin = await loadPlugin()
    expect(plugin.name).toBe('test_plugin')
  })

  it('throws if THIRDPARTY_TOKEN_PLUGIN_NAME is not set', async () => {
    delete process.env['THIRDPARTY_TOKEN_PLUGIN_NAME']
    const { loadPlugin } = await import('@src/thirdparty-async-token-lambda/plugin-loader')
    await expect(loadPlugin()).rejects.toThrow('THIRDPARTY_TOKEN_PLUGIN_NAME')
  })

  it('throws if layer module does not export createPlugin', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'bad_plugin')
    vi.mock('/opt/nodejs/bad-plugin.mjs', () => ({}))
    const { loadPlugin } = await import('@src/thirdparty-async-token-lambda/plugin-loader')
    await expect(loadPlugin()).rejects.toThrow()
  })
})
```

### Deployment Validation (Built-in)

The bootstrap pattern provides automatic deployment validation:

```typescript
const plugin = await loadPlugin()            // Fails if layer missing or export wrong
await updateForAllEnabledProfiles(true)      // Fails if plugin can't fetch token
```

If either throws → canary alarm → CodeDeploy rolls back. No additional deployment test needed.

### Layer Content Validation (CI)

```typescript
// test/unit/layer-content.test.ts
describe('ObTokenPluginLayer build output', () => {
  it('exports createPlugin conforming to ThirdPartyTokenPlugin contract', async () => {
    const mod = await import('../../.aws-sam/build/ObTokenPluginLayer/nodejs/ob-token-plugin.mjs')
    expect(typeof mod.createPlugin).toBe('function')

    const plugin = mod.createPlugin()
    expect(plugin.name).toBe('ob_token_plugin')
    expect(plugin.alertStatusCodes).toEqual([401, 403])
    expect(typeof plugin.buildTokenRequest).toBe('function')
    expect(typeof plugin.isTokenValid).toBe('function')
    expect(typeof plugin.mapResponse).toBe('function')
    expect(typeof plugin.parseConfigProfile).toBe('function')
  })
})
```

---

## Decisions

| Decision                            | Choice                                                | Rationale                                                                                                            |
|-------------------------------------|-------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Plugin module path                  | Derived from `THIRDPARTY_TOKEN_PLUGIN_NAME` in loader | CloudFormation has no string transforms; snake_case plugin names vs kebab-case filenames requires code-level mapping |
| `cri-logger` in the layer           | Bundle                                                | ESM modules in `/opt/nodejs/` cannot resolve bare specifiers from `/var/task/node_modules/`                          |
| Layer build method                  | Makefile                                              | SAM does not support `BuildMethod: esbuild` for `AWS::Serverless::LayerVersion`                                      |
| Service wiring                      | Module-level singleton via `await loadPlugin()`       | Follows code conventions (module-level singletons, top-level await for async config)                                 |
| Export convention                   | Standardised `createPlugin`                           | Universal — any plugin works without the loader knowing its name                                                     |
| Error handling in loader            | No try/catch — let errors propagate                   | Loud failure at cold start triggers canary alarm and rollback                                                        |
| Layer is mandatory                  | No condition/fallback                                 | Plugin layer is required for the lambda to function; fail fast if missing                                            |
| `THIRDPARTY_TOKEN_PLUGIN_LAYER_ARN` | Always set as env var                                 | Guarantees `AutoPublishAlias` fires on layer changes — not dependent on SAM diffing logic                            |

---

## Trade-offs

### Upsides

- **True decoupling** — nested stack has zero compile-time knowledge of any plugin
- **Independent versioning** — plugin layer can be versioned/rolled back independently of the lambda
- **Reusable nested stack** — another CRI passes their own layer ARN, no code changes
- **Clean library extraction** — when published, consumers just pass a layer ARN parameter
- **Built-in deployment validation** — bootstrap on cold start validates the layer immediately
- **Safe deployments** — canary deployment catches plugin failures before full rollout
- **No forking** — new CRIs implement the contract and plug in, no source changes needed

### Downsides

- **Dynamic import** — loses static type safety at the import boundary; mitigated by `PluginModule` interface and bootstrap failure on bad exports
- **Naming convention** — plugin name must map to filename via `_` → `-`; simple and documented but implicit
- **Duplicate `cri-logger`** — bundled in both layer and lambda (~93KB compressed total); necessary due to ESM module resolution from `/opt`
- **5 layer limit** — one slot consumed (Dynatrace uses one); 3 remaining

---

## Alternatives Considered

### NPM Library + Shim Entry Points

Publish the token stack code as an npm package. Consumers write shim files that import the library + their plugin, and esbuild bundles everything at build time.

**Why the layer approach is preferred:**
- Shims require each consumer to manage entry points in their `thirdparty-token.yaml`
- SAM `Metadata.BuildProperties.EntryPoints` doesn't support `!Ref` — can't parametrise
- The layer approach keeps the nested stack truly self-contained; consumers only pass an ARN
- Layer enables independent deployment of plugin fixes without redeploying the lambda code

**When to use shims instead:** If you need maximum tree-shaking, zero cold start penalty, and static type safety across the boundary.

### SAR (Serverless Application Repository)

The intended future mechanism for publishing the thirdparty-token stack. With the plugin decoupled via `ThirdPartyTokenPluginLayerArn`, SAR now works — consumers reference the published stack and pass their own layer ARN as a parameter, exactly like `di-ipv-cri-oauth-common` today.

The SAR artifact contains only the nested stack template and lambda code (including the plugin loader). No plugin code is included — that lives entirely in the consumer's layer. The only change from the current setup is where `thirdparty-token.yaml` is referenced from:

```yaml
# Current (local)
Location: ./thirdparty-token.yaml

# Future (SAR)
Location:
  ApplicationId: arn:aws:serverlessrepo:eu-west-2:...:applications/thirdparty-token
  SemanticVersion: 1.0.0
```

This was out of scope for the initial implementation due to SAR publishing setup complexity (packaging, versioning, CI pipeline). No architectural changes are needed to support it — the current design was built with SAR publication in mind.

---

## Reusability for Other CRIs

Once the thirdparty-token stack is published to SAR, another CRI adopts it by:

1. Creating their plugin implementing `ThirdPartyTokenPlugin` with `export const createPlugin`
2. Building it as a layer in their parent stack (filename must be kebab-case of plugin name)
3. Referencing the SAR application and passing `ThirdPartyTokenPluginLayerArn`

```yaml
# Another CRI's template.yaml
MyTokenPluginLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    ContentUri: ../
  Metadata:
    BuildMethod: makefile
    BuildArchitecture: arm64

ThirdPartyToken:
  Type: AWS::Serverless::Application
  Properties:
    Location:
      ApplicationId: arn:aws:serverlessrepo:eu-west-2:...:applications/thirdparty-token
      SemanticVersion: 1.0.0
    Parameters:
      ThirdPartyTokenPluginLayerArn: !Ref MyTokenPluginLayer
      ThirdPartyTokenPluginName: my_token_plugin
      # ...
```

The contract:
- Layer contains `/opt/nodejs/my-token-plugin.mjs` (kebab-case of `my_token_plugin`)
- Module exports `createPlugin()` returning a `ThirdPartyTokenPlugin`

No fork needed, no code changes to the published stack.

---

## Remaining Work

### Publish plugin-api as an npm package
- Publish `thirdparty-async-token-plugin-api` as a standalone npm package
- Contains the plugin interface types (`ThirdPartyTokenPlugin`, `PluginInput`, `ThirdPartyTokenRequestConfig`, `ThirdPartyTokenResponse`) and `ThirdPartyTokenPluginConfig`
- Plugin authors depend on this for type safety when implementing `createPlugin`

### Publish common as an npm package
- Publish `thirdparty-async-token-common` as a standalone npm package
- Contains token repository client, token entity types, and utility functions (expiry checks, naming)
- Depended on by both the consumer library and the SAR lambda

### Publish consumer as an npm package
- Publish `thirdparty-async-token-consumer` as a standalone npm package
- Contains `ThirdPartyTokenRetrievalService` — used by other lambdas that read cached tokens from DynamoDB
- Depends on `thirdparty-async-token-common`

### Publish to SAR
- Package the nested stack (`thirdparty-token.yaml` + lambda code including plugin-loader and service) for SAR
- Lambda bundle includes `thirdparty-async-token-common` as a dependency
- Set up versioning and CI pipeline for SAR publishing
- Consumers reference via `ApplicationId` + `SemanticVersion` and provide their own plugin layer
