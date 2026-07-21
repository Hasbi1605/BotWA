#!/bin/bash
# RembugBot Database Restore Script
# Usage: ./scripts/restore.sh [backup_file]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-/data/rembugbot.db}"
BACKUP_DIR="/tmp/rembugbot-restore"

# S3 Configuration
S3_BUCKET="${BACKUP_S3_BUCKET:-rembugbot-backups}"
S3_PREFIX="${BACKUP_S3_PREFIX:-database/}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

echo "[$(date)] Starting restore..."

# List available backups
echo "Available backups:"
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "$AWS_REGION" | \
    grep "\.tar\.gz$" | \
    sort -r | \
    head -10

if [[ -z "${1:-}" ]]; then
    echo ""
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 rembugbot_20260721_120000.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Create temp directory
mkdir -p "$BACKUP_DIR"

# Download backup
echo "[$(date)] Downloading backup: $BACKUP_FILE"
aws s3 cp \
    "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}" \
    "${BACKUP_DIR}/${BACKUP_FILE}" \
    --region "$AWS_REGION"

# Extract
echo "[$(date)] Extracting backup..."
tar -xzf "${BACKUP_DIR}/${BACKUP_FILE}" -C "$BACKUP_DIR"

# Stop gateway (if running)
echo "[$(date)] Stopping gateway..."
docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" stop gateway 2>/dev/null || true

# Backup current database
if [[ -f "$DB_PATH" ]]; then
    echo "[$(date)] Backing up current database..."
    cp "$DB_PATH" "${DB_PATH}.bak.$(date +%Y%m%d_%H%M%S)"
fi

# Restore
echo "[$(date)] Restoring database..."
cp "${BACKUP_DIR}/rembugbot.db" "$DB_PATH"

# Cleanup
rm -rf "$BACKUP_DIR"

# Restart gateway
echo "[$(date)] Starting gateway..."
docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" start gateway 2>/dev/null || true

echo "[$(date)] Restore completed successfully."
echo "[$(date)] Please verify the restored data."
