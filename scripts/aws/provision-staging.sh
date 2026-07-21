#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
PROFILE="${AWS_PROFILE:-rembugbot-provisioner}"
REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-rembugbot-staging}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.medium}"
CONFIG_PARAMETER_NAME="${CONFIG_PARAMETER_NAME:-/rembugbot/staging/env}"
TEMPLATE="$PROJECT_DIR/deploy/aws/staging.yml"

aws cloudformation validate-template \
  --profile "$PROFILE" \
  --region "$REGION" \
  --template-body "file://$TEMPLATE" >/dev/null

VPC_ID="$(aws ec2 describe-vpcs \
  --profile "$PROFILE" \
  --region "$REGION" \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)"

SUBNET_ID="$(aws ec2 describe-subnets \
  --profile "$PROFILE" \
  --region "$REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId' \
  --output text)"

AMI_ID="$(aws ssm get-parameter \
  --profile "$PROFILE" \
  --region "$REGION" \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value \
  --output text)"

if [[ "$VPC_ID" == "None" || "$SUBNET_ID" == "None" || "$AMI_ID" == "None" ]]; then
  echo "ERROR: default network or Ubuntu ARM64 AMI could not be resolved." >&2
  exit 1
fi

aws cloudformation deploy \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AmiId="$AMI_ID" \
    VpcId="$VPC_ID" \
    SubnetId="$SUBNET_ID" \
    InstanceType="$INSTANCE_TYPE" \
    ConfigParameterName="$CONFIG_PARAMETER_NAME" \
  --tags Project=RembugBot Environment=staging

aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
