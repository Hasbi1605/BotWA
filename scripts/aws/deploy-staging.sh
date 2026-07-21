#!/usr/bin/env bash
# Deploy / refresh RembugBot on the staging EC2 via SSM.
# NOTE: remote commands must run under bash (SSM default is dash).

set -euo pipefail

PROFILE="${AWS_PROFILE:-rembugbot-provisioner}"
REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-rembugbot-staging}"

INSTANCE_ID="$(aws cloudformation describe-stacks \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
  --output text)"

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  echo "ERROR: could not resolve InstanceId from stack $STACK_NAME" >&2
  exit 1
fi

# Build remote script as JSON-safe parameters via file
REMOTE_SCRIPT='#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# AWS CLI v2 (apt package awscli is unavailable on Ubuntu 24 ARM)
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  apt-get update -qq
  apt-get install -y -qq unzip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi

# Docker
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq docker.io docker-compose-v2 git curl
  systemctl enable --now docker
fi

# 1 GiB swap for 2 GiB host
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -w vm.swappiness=10
fi

install -d -m 0755 /opt/rembugbot
if [ ! -d /opt/rembugbot/app/.git ]; then
  git clone --branch main --single-branch https://github.com/Hasbi1605/BotWA.git /opt/rembugbot/app
else
  cd /opt/rembugbot/app
  git fetch --ff-only origin main
  git reset --hard origin/main
fi

aws ssm get-parameter \
  --name /rembugbot/staging/env \
  --with-decryption \
  --region ap-southeast-1 \
  --query Parameter.Value \
  --output text > /opt/rembugbot/app/docker/.env
chmod 0600 /opt/rembugbot/app/docker/.env

# Fill backup bucket if empty
if ! grep -q "^BACKUP_S3_BUCKET=.\+" /opt/rembugbot/app/docker/.env; then
  echo "BACKUP_S3_BUCKET=rembugbot-backups-330420073318-ap-southeast-1" >> /opt/rembugbot/app/docker/.env
fi

cd /opt/rembugbot/app/docker
docker compose up --build -d
docker compose ps
free -h
echo DEPLOY_OK
'

# Write commands as JSON array for SSM
PARAMS_FILE="$(mktemp)"
python3 - <<PY
import json, pathlib
script = '''$REMOTE_SCRIPT'''
# The heredoc above is expanded by bash — re-read from env is messy.
# Instead write remote script to a file below.
PY

REMOTE_FILE="$(mktemp)"
cat > "$REMOTE_FILE" <<'REMOTE'
#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  apt-get update -qq
  apt-get install -y -qq unzip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq docker.io docker-compose-v2 git curl
  systemctl enable --now docker
fi

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -w vm.swappiness=10
fi

install -d -m 0755 /opt/rembugbot
if [ ! -d /opt/rembugbot/app/.git ]; then
  git clone --branch main --single-branch https://github.com/Hasbi1605/BotWA.git /opt/rembugbot/app
else
  cd /opt/rembugbot/app
  git fetch --ff-only origin main
  git reset --hard origin/main
fi

aws ssm get-parameter \
  --name /rembugbot/staging/env \
  --with-decryption \
  --region ap-southeast-1 \
  --query Parameter.Value \
  --output text > /opt/rembugbot/app/docker/.env
chmod 0600 /opt/rembugbot/app/docker/.env

cd /opt/rembugbot/app/docker
docker compose up --build -d
docker compose ps
free -h
echo DEPLOY_OK
REMOTE

python3 - <<PY
import json, pathlib
script = pathlib.Path("$REMOTE_FILE").read_text()
# Run as bash -c with full script; SSM dash issue avoided by bash -lc
commands = ["bash -lc " + json.dumps(script)]
pathlib.Path("$PARAMS_FILE").write_text(json.dumps({"commands": commands}))
print("params ready")
PY

COMMAND_ID="$(aws ssm send-command \
  --profile "$PROFILE" \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment 'Deploy RembugBot staging' \
  --parameters "file://$PARAMS_FILE" \
  --timeout-seconds 1800 \
  --query Command.CommandId \
  --output text)"

echo "CommandId=$COMMAND_ID InstanceId=$INSTANCE_ID"

aws ssm wait command-executed \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" || true

aws ssm get-command-invocation \
  --profile "$PROFILE" \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' \
  --output json

rm -f "$PARAMS_FILE" "$REMOTE_FILE"
