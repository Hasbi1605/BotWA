#!/bin/bash
# RembugBot Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Migrations run automatically when the gateway process starts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"

echo "[$(date)] Deploying RembugBot ($ENVIRONMENT)..."

cd "$PROJECT_DIR/docker"

if [[ ! -f .env ]]; then
  echo "ERROR: docker/.env missing. Copy from docker/.env.example and fill secrets."
  exit 1
fi

echo "[$(date)] Building images..."
docker compose build

echo "[$(date)] Stopping old containers..."
docker compose down

echo "[$(date)] Starting new containers..."
docker compose up -d

echo "[$(date)] Waiting for health check..."
sleep 15

GATEWAY_HEALTH=$(docker compose exec -T gateway curl -sf http://localhost:3000/health/live || echo "failed")
if echo "$GATEWAY_HEALTH" | grep -q '"status":"ok"'; then
  echo "[$(date)] Gateway health: OK"
else
  echo "[$(date)] WARNING: Gateway health check failed"
  echo "$GATEWAY_HEALTH"
fi

WORKER_HEALTH=$(docker compose exec -T worker python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health/live').read().decode())" || echo "failed")
if echo "$WORKER_HEALTH" | grep -q '"status":"ok"'; then
  echo "[$(date)] Worker health: OK"
else
  echo "[$(date)] WARNING: Worker health check failed"
  echo "$WORKER_HEALTH"
fi

echo "[$(date)] Deployment completed."
echo "[$(date)] Check logs: cd docker && docker compose logs -f"
