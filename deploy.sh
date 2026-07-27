#!/usr/bin/env bash
set -e

RED="\033[1;31m"
GREEN="\033[1;32m"
BLUE="\033[1;34m"
NOCOLOUR="\033[0m"

stack_name="$1"

if [ -z "$stack_name" ]; then
  echo -e "${RED}[ERROR]${NOCOLOUR} ❯ stack name required as first argument, e.g. ${GREEN}./deploy.sh my-openBanking-api${NOCOLOUR}"
  exit 1
fi

echo -e "${GREEN}[INFO]${NOCOLOUR} ❯ Deploying ipv-cri-ob-api"
echo -e "${GREEN}[INFO]${NOCOLOUR} ❯ stack=${stack_name} region=eu-west-2"

echo -e "${BLUE}[1/4]${NOCOLOUR}  ❯ Running cfn-lint"
cfn-lint -t deploy/template.yaml -t deploy/thirdparty-token.yaml -f pretty
echo -e "${BLUE}[2/4]${NOCOLOUR}  ❯ Running sam validate"
sam validate -t deploy/template.yaml --lint
echo -e "${BLUE}[3/4]${NOCOLOUR}  ❯ Building"
sam build -t deploy/template.yaml --region eu-west-2
echo -e "${BLUE}[4/4]${NOCOLOUR}  ❯ Deploying to ${stack_name}"

TAGS=(
  cri:component=ipv-cri-ob-api    # component name
  cri:stack-type=dev              # dev stack
  cri:application=Lime            # Team
  cri:deployment-source=manual    # By a human
)

PARAMS=(
  Environment=dev                                # Always dev via this script
  ParameterPrefix="ipv-cri-ob-api"               # Allows bootstrapping a stack ssm parameters from the main pipeline stack
  ThirdPartyTokenResourcePrefix="ipv-cri-ob-api" # From which stack to use the async token table and ssm parameters (default is dev pipeline stack)
  ThirdPartyTokenSchedulerEnabled="false"        # **CHANGE** ThirdPartyTokenResourcePrefix before enabling or you will write to the pipeline stacks table
  DeploymentType="not-pipeline"                  # used to reconfigure api gateways in dev stacks to allow reaching them
)

sam deploy --stack-name "$stack_name" \
  --no-fail-on-empty-changeset \
  --no-confirm-changeset \
  --resolve-s3 \
  --region eu-west-2 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --tags "${TAGS[@]}" \
  --parameter-overrides "${PARAMS[@]}"
