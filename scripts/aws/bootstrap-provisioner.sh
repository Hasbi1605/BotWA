#!/usr/bin/env bash

set -euo pipefail

ROLE_NAME="RembugBotProvisionerRole"
PROFILE_NAME="rembugbot-provisioner"
REGION="${AWS_REGION:-ap-southeast-1}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CURRENT_ARN="$(aws sts get-caller-identity --query Arn --output text)"

if [[ "$CURRENT_ARN" != "arn:aws:iam::${ACCOUNT_ID}:root" ]]; then
  echo "ERROR: bootstrap must use the account root session exactly once." >&2
  exit 1
fi

TRUST_POLICY="$(jq -cn --arg account_id "$ACCOUNT_ID" '{
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: {AWS: ("arn:aws:iam::" + $account_id + ":root")},
    Action: "sts:AssumeRole"
  }]
}')"

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --description "Temporary scoped provisioning role for RembugBot" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --tags Key=Project,Value=RembugBot >/dev/null
fi

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

IAM_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "iam:AddRoleToInstanceProfile",
      "iam:AttachRolePolicy",
      "iam:CreateInstanceProfile",
      "iam:CreateRole",
      "iam:DeleteInstanceProfile",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetInstanceProfile",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagRole"
    ],
    "Resource": [
      "arn:aws:iam::*:role/RembugBot-*",
      "arn:aws:iam::*:instance-profile/RembugBot-*"
    ]
  }]
}'

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name RembugBotScopedIam \
  --policy-document "$IAM_POLICY"

aws configure set "profile.${PROFILE_NAME}.role_arn" "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
aws configure set "profile.${PROFILE_NAME}.source_profile" default
aws configure set "profile.${PROFILE_NAME}.region" "$REGION"

echo "Provisioning profile ready: ${PROFILE_NAME} (${REGION})"
