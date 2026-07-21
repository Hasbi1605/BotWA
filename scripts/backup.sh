#!/bin/bash
# RembugBot Database Backup Script
# Usage: ./scripts/backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-/data/rembugbot.db}"
BACKUP_DIR="/tmp/rembugbot-backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rembugbot_${TIMESTAMP}.tar.gz"

# S3 Configuration
S3_BUCKET="${BACKUP_S3_BUCKET:-rembugbot-backups}"
S3_PREFIX="${BACKUP_S3_PREFIX:-database/}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

echo "[$(date)] Starting backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# SQLite backup (consistent snapshot)
echo "[$(date)] Creating SQLite backup..."
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/rembugbot.db'"

# Create tarball
echo "[$(date)] Creating archive..."
tar -czf "${BACKUP_DIR}/${BACKUP_FILE}" -C "$BACKUP_DIR" rembugbot.db

# Upload to S3
echo "[$(date)] Uploading to S3..."
aws s3 cp \
    "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://${S3_BUCKET}/${S3_PREFIX}${BACKUP_FILE}" \
    --region "$AWS_REGION" \
    --sse AES256

# Cleanup local
rm -rf "$BACKUP_DIR"

echo "[$(date)] Backup completed: ${S3_PREFIX}${BACKUP_FILE}"

# Cleanup old backups (keep last 30 days)
echo "[$(date)] Cleaning up old backups..."
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}" --region "$AWS_REGION" | \
    while read -r line; do
        createDate=$(echo "$line" | awk '{print $1" "$2}')
        createDate=$(date -d "$createDate" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$createDate" +%s 2>/dev/null)
        olderThan=$(date -d "30 days ago" +%s 2>/dev/null || date -v-30d +%s 2>/dev/null)
        if [[ $createDate -lt $olderThan ]]; then
            fileName=$(echo "$line" | awk '{print $4}')
            if [[ -n "$fileName" ]]; then
                aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}${fileName}" --region "$AWS_REGION"
                echo "[$(date)] Deleted old backup: $fileName"
            fi
        fi
    done

echo "[$(date)] Backup process finished."
