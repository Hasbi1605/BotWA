#!/usr/bin/env bash
# Upload local Baileys session (from pair-local.mjs) to EC2 staging via S3 + SSM.
# Usage: ./scripts/upload-session-to-staging.sh [path/to/session]
set -euo pipefail

PROFILE="${AWS_PROFILE:-rembugbot-provisioner}"
REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-rembugbot-staging}"
BUCKET="${BACKUP_S3_BUCKET:-rembugbot-backups-330420073318-ap-southeast-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_DIR="${1:-$SCRIPT_DIR/../data/auth-local/session}"

if [[ ! -f "$SESSION_DIR/creds.json" ]]; then
  echo "ERROR: no creds.json in $SESSION_DIR — run gateway/scripts/pair-local.mjs first" >&2
  exit 1
fi

INSTANCE_ID="$(aws cloudformation describe-stacks \
  --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
  --output text)"

TMP="$(mktemp -t wa-session.XXXXXX.tgz)"
tar -C "$SESSION_DIR" -czf "$TMP" .
aws s3 cp "$TMP" "s3://${BUCKET}/tmp/wa-auth-session.tgz" \
  --profile "$PROFILE" --region "$REGION"
rm -f "$TMP"
echo "Uploaded session archive to s3://${BUCKET}/tmp/wa-auth-session.tgz"

PARAMS_FILE="$(mktemp)"
python3 - <<PY
import json
from pathlib import Path
bucket = "$BUCKET"
remote = f"""set -e
export AWS_DEFAULT_REGION={REGION if False else "$REGION"}
BUCKET={bucket}
AWS=/usr/local/bin/aws
command -v aws >/dev/null && AWS=aws
cd /opt/rembugbot/app/docker
docker compose stop gateway || true
rm -rf /var/lib/docker/volumes/docker_wa-auth/_data/session
mkdir -p /var/lib/docker/volumes/docker_wa-auth/_data/session
$AWS s3 cp s3://$BUCKET/tmp/wa-auth-session.tgz /tmp/wa-auth-session.tgz
tar -C /var/lib/docker/volumes/docker_wa-auth/_data/session -xzf /tmp/wa-auth-session.tgz
chmod -R a+rX /var/lib/docker/volumes/docker_wa-auth/_data/session
chown -R 100:101 /var/lib/docker/volumes/docker_wa-auth/_data 2>/dev/null || true
echo FILES=$(ls /var/lib/docker/volumes/docker_wa-auth/_data/session | wc -l)
docker compose up -d gateway
for i in $(seq 1 30); do
  READY=$(docker exec rembugbot-gateway curl -sS http://127.0.0.1:3000/health/ready 2>/dev/null || echo fail)
  echo "try $i $READY"
  echo "$READY" | grep -q '"whatsapp":"connected"' && break
  sleep 2
done
$AWS s3 rm s3://$BUCKET/tmp/wa-auth-session.tgz || true
rm -f /tmp/wa-auth-session.tgz
"""
# Fix: the f-string above mixed shell. Write remote script plainly:
Path("$PARAMS_FILE").write_text(json.dumps({"commands": [f"""set -e
export AWS_DEFAULT_REGION=ap-southeast-1
BUCKET={bucket}
if command -v aws >/dev/null; then AWS=aws; else AWS=/usr/local/bin/aws; fi
cd /opt/rembugbot/app/docker
docker compose stop gateway || true
rm -rf /var/lib/docker/volumes/docker_wa-auth/_data/session
mkdir -p /var/lib/docker/volumes/docker_wa-auth/_data/session
$AWS s3 cp s3://$BUCKET/tmp/wa-auth-session.tgz /tmp/wa-auth-session.tgz
tar -C /var/lib/docker/volumes/docker_wa-auth/_data/session -xzf /tmp/wa-auth-session.tgz
chmod -R a+rX /var/lib/docker/volumes/docker_wa-auth/_data/session
chown -R 100:101 /var/lib/docker/volumes/docker_wa-auth/_data 2>/dev/null || true
echo FILES=$(ls /var/lib/docker/volumes/docker_wa-auth/_data/session | wc -l)
docker compose up -d gateway
for i in $(seq 1 30); do
  READY=$(docker exec rembugbot-gateway curl -sS http://127.0.0.1:3000/health/ready 2>/dev/null || echo fail)
  echo "try $i $READY"
  echo "$READY" | grep -q '"whatsapp":"connected"' && break
  sleep 2
done
$AWS s3 rm s3://$BUCKET/tmp/wa-auth-session.tgz || true
rm -f /tmp/wa-auth-session.tgz
"""]}))
print("params ready")
PY

# simpler pure bash params
cat > "$PARAMS_FILE" <<EOF
{
  "commands": [
    "set -e; export AWS_DEFAULT_REGION=ap-southeast-1; BUCKET=${BUCKET}; if command -v aws >/dev/null; then AWS=aws; else AWS=/usr/local/bin/aws; fi; cd /opt/rembugbot/app/docker; docker compose stop gateway || true; rm -rf /var/lib/docker/volumes/docker_wa-auth/_data/session; mkdir -p /var/lib/docker/volumes/docker_wa-auth/_data/session; \\$AWS s3 cp s3://\\$BUCKET/tmp/wa-auth-session.tgz /tmp/wa-auth-session.tgz; tar -C /var/lib/docker/volumes/docker_wa-auth/_data/session -xzf /tmp/wa-auth-session.tgz; chmod -R a+rX /var/lib/docker/volumes/docker_wa-auth/_data/session; chown -R 100:101 /var/lib/docker/volumes/docker_wa-auth/_data 2>/dev/null || true; echo FILES=\\$(ls /var/lib/docker/volumes/docker_wa-auth/_data/session | wc -l); docker compose up -d gateway; for i in \\$(seq 1 30); do READY=\\$(docker exec rembugbot-gateway curl -sS http://127.0.0.1:3000/health/ready 2>/dev/null || echo fail); echo try \\$i \\$READY; echo \\$READY | grep -q '\"whatsapp\":\"connected\"' && break; sleep 2; done; \\$AWS s3 rm s3://\\$BUCKET/tmp/wa-auth-session.tgz || true; rm -f /tmp/wa-auth-session.tgz"
  ]
}
EOF

COMMAND_ID="$(aws ssm send-command \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "file://$PARAMS_FILE" \
  --timeout-seconds 180 \
  --query Command.CommandId --output text)"

echo "CommandId=$COMMAND_ID InstanceId=$INSTANCE_ID"
aws ssm wait command-executed --profile "$PROFILE" --region "$REGION" \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" || true

aws ssm get-command-invocation \
  --profile "$PROFILE" --region "$REGION" \
  --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Out:StandardOutputContent,Err:StandardErrorContent}' \
  --output json

rm -f "$PARAMS_FILE"
