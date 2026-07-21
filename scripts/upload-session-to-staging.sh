#!/usr/bin/env bash
# Upload local Baileys session (from pair-local.mjs) to EC2 staging via SSM.
# Usage: ./scripts/upload-session-to-staging.sh [path/to/session]
set -euo pipefail

PROFILE="${AWS_PROFILE:-rembugbot-provisioner}"
REGION="${AWS_REGION:-ap-southeast-1}"
STACK_NAME="${STACK_NAME:-rembugbot-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_DIR="${1:-$SCRIPT_DIR/../data/auth-local/session}"

if [[ ! -f "$SESSION_DIR/creds.json" ]]; then
  echo "ERROR: no creds.json in $SESSION_DIR — run pair-local.mjs first" >&2
  exit 1
fi

INSTANCE_ID="$(aws cloudformation describe-stacks \
  --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" \
  --output text)"

PARAMS_FILE="$(mktemp)"
export SESSION_DIR PARAMS_FILE

python3 <<'PY'
import base64, io, json, os, tarfile
from pathlib import Path

session = Path(os.environ["SESSION_DIR"])
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for p in session.iterdir():
        if p.is_file():
            tar.add(p, arcname=p.name)
b64 = base64.b64encode(buf.getvalue()).decode()

remote = f"""set -e
docker compose -f /opt/rembugbot/app/docker/docker-compose.yml stop gateway || true
rm -rf /var/lib/docker/volumes/docker_wa-auth/_data/session
mkdir -p /var/lib/docker/volumes/docker_wa-auth/_data/session
python3 - <<'PY2'
import base64, tarfile, io
from pathlib import Path
b64 = '''{b64}'''
raw = base64.b64decode(b64)
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
    tar.extractall('/var/lib/docker/volumes/docker_wa-auth/_data/session')
print('extracted', len(list(Path('/var/lib/docker/volumes/docker_wa-auth/_data/session').iterdir())), 'files')
PY2
chmod -R a+rX /var/lib/docker/volumes/docker_wa-auth/_data/session
ls -la /var/lib/docker/volumes/docker_wa-auth/_data/session
cd /opt/rembugbot/app/docker
docker compose up -d gateway
sleep 10
docker exec rembugbot-gateway curl -sS http://127.0.0.1:3000/health/ready || true
echo
docker logs rembugbot-gateway 2>&1 | grep -E 'connected successfully|WhatsApp connected|Connection closed|error' | tail -20
"""

Path(os.environ["PARAMS_FILE"]).write_text(json.dumps({"commands": [remote]}))
print(f"session archive ready ({len(b64)} b64 chars)")
PY

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
