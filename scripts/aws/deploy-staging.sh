#!/usr/bin/env bash

set -euo pipefail

PROFILE="${AWS_PROFILE:-rembugbot-provisioner}"
REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-rembugbot-staging}"

# shellcheck disable=SC2016
INSTANCE_ID="$(aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)"

COMMAND_ID="$(aws ssm send-command \
  --profile "$PROFILE" \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment 'Deploy RembugBot staging' \
  --parameters 'commands=["set -euo pipefail","cd /opt/rembugbot/app","git pull --ff-only origin main","aws ssm get-parameter --name /rembugbot/staging/env --with-decryption --region ap-southeast-1 --query Parameter.Value --output text > docker/.env","chmod 0600 docker/.env","cd docker","docker compose up --build -d","docker compose ps"]' \
  --query Command.CommandId \
  --output text)"

aws ssm wait command-executed \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID"

aws ssm get-command-invocation \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json
