# RFC-001: Async Token Alerting Strategy Options for Lambda and consumer service

## Problem

The thirdparty token implementation has two failure surfaces that need runtime alerting:

1. **Async Token Lambda** — fails to refresh a token for a specific profile prefix. We want Slack to indicate which prefix failed without requiring manual log inspection.
2. **Consumer Service** — a consumer Lambda attempts to retrieve a token and finds it missing or expired. This means the downstream third-party call will fail or be skipped.

Both need dedicated alarms. The challenge is the same for both: CloudWatch alarm notifications are static and cannot include runtime context like which profile prefix was affected.

## Context

There are two implementations of async token functionality:
- Open Banking CRI (this repo) — **TypeScript**
- Fraud CRI (original implementation) — **Java**

The TS implementation is designed as a reusable nested stack with plugin injection. Any CRI adopting this stack (or the future SAR artifact) inherits the alerting choices made here. Known future consumers:
- **Fraud CRI** — the TS implementation was designed as a drop-in replacement for the Java implementation
- **DL CRI** (Java) — two third-parties, meaning two nested stack instances each with its own plugin layer and profiles
- **Passport CRI** (Java) — one third-party

The alerting strategy must scale without requiring per-plugin alarm duplication. DL CRI would have two nested stack instances, and any CRI migrating between third-parties would temporarily run both. Per-prefix or per-plugin alarms (Option 2) would multiply quickly in these scenarios.

## Current Setup

```
CloudWatch Alarm → SNS Topic (build-notifications stack) → AWS Chatbot → Slack
```

**Notification stack** (`devplatform-deploy/build-notifications`) provides multiple severity channels:
- `BuildNotificationTopic` → build/pipeline notifications channel
- `WarningAlertsTopic` → warning channel
- `CriticalAlertsTopic` → critical channel
- `PagerDutySNSTopic` → PagerDuty

Each routes to a separate Slack channel via `AWS::Chatbot::SlackChannelConfiguration`.

The enricher Lambda (`BuildNotificationEnricherFunction`) only enriches **CodePipeline** events — not CloudWatch alarm notifications. It checks for `detailType == "CodePipeline Pipeline Execution State Change"` and ignores all other event types. CloudWatch alarm notifications pass directly to AWS Chatbot unenriched.

**Current alarm** (`CanaryThirdPartyAsyncTokenFunctionErrorsAlarm` in `deploy/thirdparty-token.yaml`):
- Metric: `AWS/Lambda` → `Errors` on `ThirdPartyAsyncTokenFunction`
- Period: 60s, Threshold: ≥ 1
- Routes to: `CriticalAlertsTopicArn`
- Purpose: canary deployment gate only — not used for runtime alerting

There are currently no dedicated runtime alarms for the thirdparty token implementation. This RFC proposes adding some and lists options.

**What Slack shows (via AWS Chatbot, fixed format):**
```
Namespace: AWS/Lambda
Metric: Errors
Timestamp: Sat, 20 Jun 2026 15:12:35 UTC
Alarm Description: <CriIdentifier>-<Environment>-<ParentStackName> ThirdPartyAsyncTokenFunction lambda has returned errors
Alarm State: ALARM
Metric Alarm Name: <ParentStackName>-ThirdPartyAsyncTokenFunction-Errors
```

**Fields we can control:**
- Metric Alarm Name (static, set at deploy time)
- Alarm Description (static, set at deploy time)
- Namespace (determined by which metric we alarm on)
- Metric (determined by which metric we alarm on)
- Which SNS topic to notify (determines severity channel)

**Fields we cannot control:**
- Message format (owned by AWS Chatbot)
- Dynamic runtime context in the notification

## Constraint

The alarm description and name are static (set at deploy time). They cannot contain runtime information like "LIVE failed at 15:12". The failed prefix is only known at runtime.

Additionally, the nested stack cannot hardcode profile names into alarm resources. Profiles are configured via SSM (`enabledProfiles`) by each consuming team — they vary per environment and per CRI. Any alerting baked into the nested stack must be profile-agnostic. Per-prefix alarms (Option 2) can only be defined in the parent stack where the team controls their own profile names.

## How Failures Currently Surface

### Async Token Lambda

The `ThirdPartyAsyncTokenFunction` processes all enabled profiles in parallel. Individual profile failures are caught and logged, then aggregated:

```typescript
// In handler - updateForAllEnabledProfiles():
logger.error(`Failed for token prefix: ${tokenPrefix} - ${message}`)
// ...after all profiles complete:
throw new Error(`Failed for token prefixes: ${failures.join(', ')}`)
```

The thrown error causes the Lambda invocation to fail → `Errors` metric increments → alarm fires.

The alarm tells you "the token Lambda errored" but not which prefix(es) failed.

### Consumer Service

Consumer Lambdas call `retrieveTokenForConfigProfileName(profileName)` which returns `undefined` when:
- No token exists in DynamoDB for the requested profile
- The token's TTL has expired

Currently, these cases are logged as warnings but no metric is emitted and no alarm fires:

```typescript
// Token missing:
logger.info(`ProfileName ${configProfileName} - existing cached token: false, ttl expired: false`)

// Token expired:
logger.warn(`Cannot use current token ${tokenName} as it has expired ${expiredDateTime}`)
```

Consumer failures are a lagging indicator — they confirm the async Lambda has been failing long enough for tokens to expire. Alerting on both gives early warning (async Lambda failure) and impact confirmation (consumer unable to retrieve token).

## Options

### Option 1: Single generic Lambda Errors alarm

- **Async Token Alarm**: New dedicated alarm on Lambda `Errors` metric (separate from canary alarm)
- **Consumer Alarm**: Not addressed — consumer returns `undefined` silently, doesn't throw
- **Slack context**: Tells you the async Lambda failed, not which prefix
- **To find the prefix**: Open CloudWatch logs, look at `logger.error` output

| Pros                                        | Cons                                                        |
|---------------------------------------------|-------------------------------------------------------------|
| Simple — single alarm on standard metric    | No prefix context in Slack                                  |
| Scales to any number of prefixes            | Requires log inspection                                     |
| No custom metrics needed                    | Doesn't cover consumer-side failures                        |
| Can live in nested stack (profile-agnostic) | Doesn't distinguish token failures from other Lambda errors |
| Inherited by all CRIs using the stack       |                                                             |

---

### Option 2: One alarm per prefix (static)

- **Async Token Alarms**: `ThirdPartyAsyncToken-STUB-Failed`, `ThirdPartyAsyncToken-LIVE-Failed`, etc.
- **Consumer Alarms**: `ThirdPartyTokenUnavailable-STUB`, `ThirdPartyTokenUnavailable-LIVE`, etc.
- **Metric**: Custom metric with `tokenPrefix` dimension, emitted on failure in both services
- **Slack context**: Alarm name and description tell you exactly which prefix failed and whether it was a refresh or retrieval failure

This pattern is already used in the Fraud CRI, but is a known maintenance burden — each profile requires its own set of alarms for both the async token Lambda and any consumer Lambdas that depend on the token. Adding or removing a profile means updating multiple alarm resources across templates.

The maintenance burden could be mitigated via programmatic generation (e.g. CloudFormation macros, CDK, or a build-time script that generates alarm resources from the `enabledProfiles` list). However, this adds complexity and may make testing the alarms harder — generated resources are less visible in code review and harder to reason about in infra tests.

| Pros                               | Cons                                                                         |
|------------------------------------|------------------------------------------------------------------------------|
| Full context in Slack notification | Cannot live in nested stack — requires knowledge of profile names            |
| Specific, actionable alerts        | Must update template when prefixes change (unless generated)                 |
| Proven pattern (Fraud CRI)         | Prefixes from SSM `enabledProfiles` — alarms would differ per env            |
| Covers both async and consumer     | Generated alarms harder to test and review                                   |
|                                    | N alarms per profile × 2 (async token + consumer) to maintain                |
|                                    | Multiplies quickly with multiple plugins (DL CRI) or during migrations       |
|                                    | Known maintenance burden in Fraud CRI                                        |
|                                    | Each consuming CRI must define its own alarms — no reuse from nested stack   |

---

### Option 3: Enricher Lambda

```
CloudWatch Alarm → SNS → Enricher Lambda → Slack webhook
```

- **Alarm**: Custom metric alarm(s) on async token and/or consumer
- **Enricher**: Receives alarm, queries recent logs, extracts failed prefix, posts to Slack
- **Slack context**: Rich message with prefix, error detail, log link, whether it was refresh or retrieval

| Pros                                               | Cons                                                       |
|----------------------------------------------------|------------------------------------------------------------|
| Full runtime context in Slack                      | Additional Lambda to maintain                              |
| Scales automatically — no changes for new prefixes | Bypasses/duplicates external alarm stack                   |
| Can include log links, timestamps, etc.            | Coupling to Slack webhook format                           |
| Covers both async and consumer from one enricher   | Extra infrastructure (Lambda + IAM + Slack config)         |
| Profile-agnostic — works with any nested stack     | Would need to be built per-CRI or as a platform capability |
| No nested stack changes needed                     |                                                            |

---

### Option 4: Custom metrics (dimensionless) + descriptive alarms

Two custom metrics, one alarm each:

**Async Token Lambda:**
- **Metric**: `TokenUpdateFailed` (count = number of failed prefixes), emitted in the handler's catch block
- **Alarm**: `ThirdPartyAsyncToken-<PluginName>-TokenUpdateFailed`
- **Description**: "<PluginName> - One or more token profile updates failed. Check logs for which prefix(es) failed."
- Lives in the nested stack — the stack owns the Lambda and can alarm on its custom metric

**Consumer Service:**
- **Metric**: `TokenRetrievalUnavailable` (count = 1), emitted when `retrieveTokenForConfigProfileName` returns `undefined`
- **Alarm**: `ThirdPartyToken-<PluginName>-TokenRetrievalUnavailable`
- **Description**: "<PluginName> - A consumer Lambda could not retrieve a valid token. Check logs for which profile and consumer."
- Must live in the parent stack — the nested stack has no visibility into which Lambdas consume the token or which profiles they request

**Limitation**: Neither alarm can differentiate by profile. The async token Lambda processes all profiles in a single invocation and emits a single aggregate count. Consumer Lambdas emit from different function contexts but without a `tokenPrefix` dimension — adding one would push us back toward Option 2's per-prefix alarm problem.

| Pros                                                        | Cons                                                       |
|-------------------------------------------------------------|------------------------------------------------------------|
| Two alarms cover both failure surfaces                      | Doesn't tell you *which* prefix failed in the notification |
| No per-prefix maintenance                                   | Still requires log inspection for specifics                |
| Separates concerns: refresh failure vs retrieval failure    | Consumer alarm can't live in nested stack                  |
| Async token alarm comes free with nested stack              | No way to differentiate profiles without per-prefix alarms |
| Profile-agnostic — works for any CRI regardless of profiles | Consumer alarm must be adopted by each parent stack        |
| Scales to multiple plugins (DL CRI) without duplication     |                                                            |
| Description gives responder a starting point                |                                                            |

---

### Option 5: CloudWatch Log Metric Filters

Use CloudWatch Log Metric Filters to extract metrics directly from existing log output — no code changes required.

**Async Token Lambda:**
- **Filter pattern**: `"Failed for token prefix"` on the Lambda's log group
- **Metric**: `TokenUpdateFailed` (count)
- **Alarm**: Fires when filter matches ≥ 1 in a period
- Lives in the nested stack (owns the log group)

**Consumer Service:**
- **Filter pattern**: `"Cannot use current token"` on consumer Lambda log group(s)
- **Metric**: `TokenRetrievalUnavailable` (count)
- **Alarm**: Fires when filter matches ≥ 1 in a period
- Must be defined in the parent stack (consumer log groups are not owned by the nested stack)

| Pros                                                         | Cons                                                                       |
|--------------------------------------------------------------|----------------------------------------------------------------------------|
| Zero code changes — uses existing logging                    | Regex-based — fragile if log messages are refactored                       |
| No per-prefix maintenance                                    | No prefix context in Slack                                                 |
| Separates concerns: refresh failure vs retrieval failure     | Consumer filter/alarm must be defined per consuming Lambda in parent stack |
| Async token filter can live in nested stack (owns log group) | Less precise than code-emitted metrics (can't easily count per-prefix)     |
| Profile-agnostic — works for any CRI                         | Log message format becomes part of the alerting contract                   |
| Works immediately with current code                          | Cannot differentiate profiles without separate filters per prefix          |

---

## Recommendation

**Option 4** — custom metrics + descriptive alarms for both the async token Lambda and the consumer service.

- Profile-agnostic — no changes when profiles are added/removed
- Async token alarm lives in the nested stack — every CRI gets it for free
- Consumer metric auto-emitted by the shared library — zero effort for consuming teams
- Consumer alarm is the one piece parent stacks must adopt, but it's a single generic alarm
- Scales to multiple plugins (DL CRI with two nested stacks gets two async token alarms automatically)
- Log inspection for "which prefix" is acceptable given the 1-minute invocation frequency — logs are shallow and the Insights query is trivial

The canary alarm remains solely as the deployment gate.

**Future enhancement: Option 3** (Enricher Lambda) is the natural evolution. It's the only option that fully solves the original problem (prefix context in Slack) and can be layered on top of Option 4 — subscribing to the same alarm's SNS topic and enriching the notification. However, it requires infrastructure outside the nested stack (separate Lambda, IAM, Slack webhook), has ownership ambiguity (CRI team vs platform team), and bypasses the existing build-notifications pipeline. If log inspection proves too slow in practice, this should be proposed as a platform-level capability rather than built per-CRI.

**Option 2 is viable if** profiles where standardized across teams and the team accepts the manual maintenance cost of N × 2 alarms per plugin instance — but it cannot live in the nested stack and multiplies quickly with multiple plugins or during third-party migrations.

## Current Logging (already in place)

**Async Token Lambda:**
```typescript
// Per-profile failure (in handler catch block):
logger.error(`Failed for token prefix: ${tokenPrefix} - ${message}`)

// Aggregated error (thrown after all profiles complete):
throw new Error(`Failed for token prefixes: ${failures.join(', ')}`)
```

**Consumer Service:**
```typescript
// Token missing:
logger.info(`ProfileName ${configProfileName} - existing cached token: false, ttl expired: false`)

// Token expired:
logger.warn(`Cannot use current token ${tokenName} as it has expired ${expiredDateTime}`)
```

These structured log entries are queryable via CloudWatch Logs Insights:
```
fields @timestamp, @message
| filter @message like /Failed for token prefix/ or @message like /Cannot use current token/
| sort @timestamp desc
| limit 10
```

## Implementation Notes (if Option 4 is chosen)

### Async Token Lambda

Emit in `thirdparty-async-token-lambda.ts` using the existing `@govuk-one-login/cri-metrics` package:

```typescript
// In the catch block of updateForAllEnabledProfiles:
metrics.addMetric('TokenUpdateFailed', MetricUnit.Count, failures.length)
```

**Alarm**: Lives in `deploy/thirdparty-token.yaml` alongside the existing canary alarm. Any CRI using the nested stack gets this automatically.

### Consumer Service

Emit in `token-retrieval-service.ts` when returning `undefined`:

```typescript
// When token is missing or expired:
metrics.addMetric('TokenRetrievalUnavailable', MetricUnit.Count, 1)
```

The metric emission is baked into the shared consumer library (`thirdparty-async-token-consumer`), so any Lambda using `retrieveTokenForConfigProfileName` emits it automatically.

**Alarm**: Must be defined in the parent stack (or wherever the consuming Lambda is defined) — the nested stack does not own consumer Lambda log groups or metric namespaces. The parent stack references the consumer Lambda's metric namespace and creates the alarm.

### Ownership Summary

| Component                          | Where it lives                         | Who owns it                   |
|------------------------------------|----------------------------------------|-------------------------------|
| `TokenUpdateFailed` metric         | Async token Lambda (nested stack code) | Nested stack                  |
| `TokenUpdateFailed` alarm          | `deploy/thirdparty-token.yaml`         | Nested stack                  |
| `TokenRetrievalUnavailable` metric | Consumer library code                  | Shared library (auto-emitted) |
| `TokenRetrievalUnavailable` alarm  | Parent stack template                  | Parent stack (per consumer)   |

### Alert Severity

| Alarm                             | Severity | Rationale                                                               |
|-----------------------------------|----------|-------------------------------------------------------------------------|
| `TokenUpdateFailed`               | Warning  | Early warning — tokens may still be valid, consumers not yet impacted   |
| `TokenRetrievalUnavailable`       | Critical | Active impact — consumer cannot make third-party calls for this profile |
