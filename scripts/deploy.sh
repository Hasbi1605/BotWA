#!/bin/bash
# RembugBot Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"

echo "[$(date)] Deploying RembugBot ($ENVIRONMENT)..."

cd "$PROJECT_DIR/docker"

# Build images
echo "[$(date)] Building images..."
docker compose build --no-cache

# Run migrations (in gateway container)
echo "[$(date)] Running migrations..."
docker compose run --rm gateway npm run migrate

# Stop old containers
echo "[$(date)] Stopping old containers..."
docker compose down

# Start new containers
echo "[$(date)] Starting new containers..."
docker compose up -d

# Health check
echo "[$(date)] Waiting for health check..."
sleep 10

# Check gateway health
GATEWAY_HEALTH=$(docker compose exec gateway curl -s http://localhost:3000/health/live || echo "failed")
if echo "$GATEWAY_HEALTH" | grep -q '"status":"ok"'; then
    echo "[$(date)] Gateway health: OK"
else
    echo "[$(date)] WARNING: Gateway health check failed"
    echo "$GATEWAY_HEALTH"
fi

# Check worker health
WORKER_HEALTH=$(docker compose exec worker python -c "import httpx; print(httpx.get('http://localhost:8000/health/live').json())" || echo "failed")
if echo "$WORKER_HEALTH" | grep -q '"status":"ok"'; then
    echo "[$(date)] Worker health: OK"
else
    echo "[$(date)] WARNING: Worker health check failed"
    echo "$WORKER_HEALTH"
fi

echo "[$(date)] Deployment completed."
echo "[$(date)] Check logs: docker compose logs -f"
