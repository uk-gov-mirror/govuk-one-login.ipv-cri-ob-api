# Code Conventions

## Language & Module System

- TypeScript with strict mode enabled (`"strict": true` in tsconfig)
- ESM modules (`"type": "module"` in package.json, `"verbatimModuleSyntax": true`)
- Target: ESNext

## Formatting (Prettier)

- Single quotes
- No semicolons
- 2-space indentation
- No trailing commas
- LF line endings
- 100 character print width

## Linting (ESLint)

- `typescript-eslint` with recommended + type-checked + stylistic rules
- `eslint-plugin-perfectionist` for natural sort ordering of object keys, imports, etc.
- `no-console: error` in source (off in tests)
- `no-explicit-any: error`
- Unused vars/params prefixed with `_` are allowed
- Blank line required after import block

## Import Conventions

- Type-only imports use `import type` (separate-type-imports fixStyle, enforced by eslint)
- Mixed imports (value + type from the same module) use inline `type` keyword on type specifiers
- Type imports are grouped first, then named imports, then defaults — sorted naturally
- Newlines between import groups
- Path aliases: `@src/*` → `./src/*`, `@common/*` → `./src/common/*`
- Use path aliases for all cross-domain imports (e.g. `@src/issue-credential/...`, `@common/util/...`)
- Use relative paths (`./`) only within barrel `index.ts` files re-exporting from their own package

## Naming

- Files: `kebab-case.ts` (e.g. `issue-credential-service.ts`)
- Interfaces: `PascalCase` (e.g. `SessionRepository`, `ThirdPartyTokenPlugin`)
- Types: `PascalCase` (e.g. `IssueCredentialRequest`)
- Functions/variables: `camelCase` (e.g. `createIssueCredentialService`)
- Constants (enum-like objects): `PascalCase` keys with `as const` (e.g. `LambdaResult.SUCCESS`)
- Metric names/dimensions: `snake_case` strings (e.g. `lambda_result`, `start_state`)
- Environment variables: `SCREAMING_SNAKE_CASE`

## Project Structure

```
src/
  <domain>/
    handler/       # Lambda entry points
    service/       # Business logic
    client/        # External integrations (DynamoDB, KMS, etc.)
    model/         # Interfaces and types for the domain
    error/         # Domain-specific error classes
    util/          # Pure utility functions
  common/          # Shared code across domains
  types/           # Shared type definitions (API contracts)
```

Tests mirror src structure under `test/unit/<domain>/`.

## Lambda Handler Pattern (Common)

- Use `middy` for middleware composition
- Handler function is a plain `async` function, wired last via `.handler(lambdaHandler)`
- All handlers use `injectLambdaContext` and `logMetrics` middleware
- Module-level wiring (singleton creation, config loading) happens above the handler definition
- Top-level `await` is acceptable for async config that must resolve before the module is usable (e.g. SSM parameter fetching)

## Lambda Handler Pattern (API Gateway)

- Middleware order: `latencyRecorder` → `resultRecorder` → `injectLambdaContext` → `logMetrics` → `httpHeaderNormalizer` → `errorHandler`
- `errorHandler` middleware converts thrown errors into formatted HTTP responses

## Lambda Handler Pattern (Async / Scheduled)

- Use `middy` with `injectLambdaContext` → `logMetrics` only (no `errorHandler`, `httpHeaderNormalizer`, or latency/result recorders)
- Omit `errorHandler` — errors must propagate so Lambda marks the invocation as failed (enabling retries, DLQs, and canary alarm triggers)
- Bootstrap (top-level `await` on cold start): must always throw on failure — a failed deployment must trigger canary rollback
- Scheduled handler: throwing is preferred so CloudWatch error metrics and alarms fire, but the scheduling cadence provides implicit retry so the severity is lower than bootstrap

## Dependency Injection

- Services use a **factory function** pattern: `createXService(collaborators)` returns a function or object
- Collaborators are passed as a single typed object
- Module-level singletons are exported for wiring (e.g. `export const sessionRepository = createSessionRepository(client)`)
- This enables unit tests to spy on module-level exports

## Error Handling

### Structure

- Domain errors extend `CriError` with an HTTP status code
- Each error class lives in its own file under `<domain>/error/`
- Barrel `index.ts` re-exports all errors from a domain

### API Gateway lambdas (journey flow)

- Throw typed `CriError` subclasses with a fixed message and status code per failure case
- `errorHandler` middleware converts these into HTTP responses via `formatErrorResponse`
- **TODO**: `formatErrorResponse` currently leaks internal error messages to the client for 4xx errors. This needs to be changed to produce the OAuth2-compatible format expected by common-express's OAuth2 middleware:
  ```typescript
  return {
    body: JSON.stringify({
      oauth_error: {
        error: 'server_error',
        error_description: 'Unexpected server error'
      }
    }),
    statusCode: 500
  }
  ```
- `error` and `error_description` must be values from the OAuth2 spec (e.g. `server_error`, `invalid_request`, `access_denied`) — never expose internal error messages

### Async / scheduled lambdas

- Return structured result objects (e.g. `{ updated: boolean, message: string }`) with descriptive failure messages rather than throwing
- Only throw at the aggregate level to trigger retries/alarms
- When processing multiple items in parallel, catch individual failures to avoid blocking others, then throw an aggregated error after all have completed

### Error message conventions

- Each failure path must produce a unique, deterministic message — this enables precise CloudWatch log filtering and test assertions
- Use the pattern `error instanceof Error ? error.message : 'Unknown error'` when catching unknown errors
- Distinguish alert-worthy errors (e.g. 401/403 from a third party) from routine failures via `alertStatusCodes` or equivalent, so metrics/alarms can fire selectively

## Enums / Constants

- No TypeScript `enum` keyword — use `as const` objects with a derived union type:
  ```ts
  export const LambdaResult = { ERROR: 'error', SUCCESS: 'success' } as const
  export type LambdaResult = (typeof LambdaResult)[keyof typeof LambdaResult]
  ```

## Interfaces

- Repository interfaces define the contract, factory functions return the implementation
- Prefer interfaces to type aliases for object shapes with methods
- Simple data shapes use `interface` (e.g. `IssueCredentialRequest`)

## Testing (Vitest)

- Test files: `<name>.test.ts` colocated in mirrored `test/unit/` structure
- Use `vi.spyOn` on module-level exports for mocking
- Builder functions for test data: `buildEvent()`, `buildSession()`, etc.
- `afterEach` restores and clears all mocks
- Tests are silent for passed tests (`silent: 'passed-only'`)
- Coverage via `v8` provider, output as `lcov`
- Each error/failure path should have a test asserting on the specific status code or message substring

## Acceptance Tests (Cucumber)

- Gherkin `.feature` files in `test/acceptance-tests/features/`
- Step definitions in `test/acceptance-tests/steps/`
- Organised by endpoint/resource (e.g. `banks-happy-path.feature`, `banks-steps.ts`)
- API clients in `test/acceptance-tests/clients/`

## Infrastructure Tests

- Vitest tests in `test/infra/` validate CloudFormation/SAM templates
- Separate vitest config: `vitest.infra.config.ts`

## Logging

- Use `@govuk-one-login/cri-logger` (wraps Powertools Logger)
- Append structured keys with `logger.appendKeys()`
- Log at meaningful checkpoints (e.g. "Session retrieved", "Credential signed")
- Never log secrets or full error objects that may contain sensitive payloads
- When catching unknown errors (`catch (error: unknown)`), always extract the message safely before logging — never pass the raw error object: `error instanceof Error ? error.message : 'Unknown error'`
- Known, typed values (e.g. token names, profile names, status codes, constructed result messages) are safe to log

## Metrics

- Use `@govuk-one-login/cri-metrics` (wraps Powertools Metrics)
- Custom metrics emitted via `captureMetricWithDimensions`
- Cold start metric captured automatically by `logMetrics` middleware

## Promises & Fetch

- Use `async`/`await` for most asynchronous code
- External HTTP calls via `fetch` must use `.then()/.catch()` chaining when the response handling forms a self-contained pipeline
- Do not mix styles within the same function — pick one

### Fetch pipeline pattern (preferred for external API calls)

When calling a third-party endpoint, structure the `.then()` chain as a series of discrete validation gates, each returning a typed result object on failure:

```typescript
return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  .then(async (response) => {
    // AbortSignal only covers until headers arrive — body read needs its own timeout
    const body = await Promise.race([
      response.text(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Response body read timed out')), timeoutMs)
      )
    ])
    if (response.status !== 200) {
      return { message: `Non-200 status - ${response.status}`, value: undefined }
    }
    const parsed = mapResponse(body)
    if (!parsed) {
      return { message: 'Response mapping failed', value: undefined }
    }
    if (!isValid(parsed)) {
      return { message: 'Validation failed', value: undefined }
    }
    return { message: 'success', value: parsed }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { message: `Request failed - ${message}`, value: undefined }
  })
```

This produces:
- A single return type for both success and failure (no thrown exceptions)
- Each failure path has a unique message — testable via `expect(result.message).toContain(...)`
- `.catch()` handles network errors, timeouts, and unexpected exceptions in one place
- Tests map 1:1 to each exit point in the chain
- `AbortSignal.timeout()` only covers until headers arrive — add a separate timeout for `response.text()` body reads (e.g. via `Promise.race`)

## Validation

- Use `zod` for runtime schema validation (SSM config, API responses, input payloads)
- Validation typically lives at the boundary — in clients (parsing external responses) or at service entry (parsing config/input)
- Catch or wrap `ZodError` at the call site rather than letting raw zod errors propagate to callers
