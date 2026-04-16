# Open Banking Credential Issuer API

A serverless AWS Lambda-based API service that provides Open Banking credential verification capabilities. This service enables secure integration with an Open Banking provider to verify user financial data for identity verification purposes.

## Overview

This API consists of:
- **Public API Gateway**: External-facing endpoints for Open Banking interactions
- **Private API Gateway**: Internal endpoints for system integration
- **Lambda Functions**: Serverless compute for processing Open Banking requests
- **CloudWatch Monitoring**: Comprehensive logging and alerting
- **Canary Deployments**: Safe deployment strategies with automatic rollback

## Prerequisites

- Node.js (version specified in `.nvmrc`)
- AWS CLI configured with appropriate permissions
- AWS Vault for credential management
- SAM CLI for local development and deployment

See the Lime onboarding guide for detailed setup instructions.

## Quick Start

### Installation

#### Use correct Node.js version
`nvm use`

##### Install dependencies
`npm ci`

### Testing

### Run all tests
`npm test`

### Run with coverage
`npm run test:coverage`

### Run Infra tests
`npm run test:infra`

Coverage reports are generated in coverage/ directory.

## Code Quality

### Type Checking

`npm run type-check`

### Pre-commit Hooks

Install pre-commit hooks for automated security and quality checks:
`pre-commit install`

To run manually on all files
`pre-commit run --all-files`

### Linting

`npm run lint`
`npm run lint:fix`

### Formatting

`npm run format`
`npm run format:fix`

## Local Development

The project uses `esbuild` for building and `vitest` for unit testing. All source code is in TypeScript and follows ESLint configuration with Prettier formatting.

`esbuild` config is per handler, is managed in `template.yaml` under each Lambda's `Metadata` section and handles TypeScript compilation and dependency bundling.

### Deployment into Development environment

`aws-vault exec ob-dev -- ./deploy.sh ipv-cri-ob-api-MyUsernameOrTicketNumber`

## Canaries

When deploying using sam deploy, canary deployment strategy will be used which is set in LambdaDeploymentPreference in template.yaml file.

When deploying using the pipeline, canary deployment strategy set in the pipeline will be used and override the default set in template.yaml.

Canary deployments will cause a rollback if any canary alarms associated with a lambda are triggered.

To skip canaries such as when releasing urgent changes to production, set the last commit message to contain either of these phrases: [skip canary], [canary skip], or [no canary] as specified in the [Canary Escape Hatch guide](https://govukverify.atlassian.net/wiki/spaces/PLAT/pages/3836051600/Rollback+Recovery+Guidance#Escape-Hatch%3A-how-to-skip-canary-deployments-when-needed).
`git commit -m "some message [skip canary]"`

Note: To update LambdaDeploymentPreference, update the LambdaCanaryDeployment pipeline parameter in the [identity-common-infra repository](https://github.com/govuk-one-login/identity-common-infra/tree/main/terraform/lime/open-banking). To update the LambdaDeploymentPreference for a stack in dev using sam deploy, parameter override needs to be set in the [deploy script](./deploy.sh).
`--parameter-overrides LambdaDeploymentPreference=<define-strategy> \`

## Parameter prefix

This allows a deploying stack to use parameters of another stack.
Created to enable pre-merge integration tests to use the parameters of the pipeline stack.

ParameterPrefix if set, this value is used in place of AWS::Stackname for parameter store paths.
- Default is "none", which will use AWS::StackName as the prefix.

Can also be used with the following limitations in development.
- Existing stack needs to have all the parameters needed for the stack with the prefix enabled.
- Existing stack parameters values if changed will trigger behaviour changes in the stack with the prefix enabled.
- Existing stack if deleted will cause errors in the deployed stack.

## Quality Gate Tags

All API tests should be tagged with `@QualityGateIntegrationTest`. If a test runs in our pipelines (ie in Build), and tests live features, we should tag them with `@QualityGateRegressionTest`.
If the test is for an in-development feature, we should tag it with `@QualityGateNewFeatureTest`.
Tests that run in build and staging environments to verify essential functionality should be tagged with`@QualityGateSmokeTest`.
Infrastructure and stack validation tests should be tagged with `@QualityGateStackTest`.

Once a feature goes live, `@QualityGateNewFeatureTest` tags need to be updated to `@QualityGateRegressionTest`.
To facilitate this update, API tests for in-development work should be placed in their own feature files, if possible, so the tests can be tagged at the Feature level rather than the Scenario level.
Ideally, tests tagged with `@QualityGateNewFeatureTest` should be marked with a TODO and reference a post-go-live clean-up ticket so they can be easily identified and updated.
