# Runbook: Backup and Restore

## Automated Backup

Backups run daily at 03:00 WIB via cron job in the gateway.

### Manual Backup
```bash
./scripts/backup.sh
```

### Verify Backup
```bash
aws s3 ls s3://rembugbot-backups/database/ --region ap-southeast-1
```

## Restore

### List Available Backups
```bash
./scripts/restore.sh
# Will show available backups
```

### Restore Specific Backup
```bash
./scripts/restore.sh rembugbot_20260721_120000.tar.gz
```

### Post-Restore Verification
```bash
# Check database integrity
sqlite3 /data/rembugbot.db "PRAGMA integrity_check;"

# Verify data
sqlite3 /data/rembugbot.db "SELECT COUNT(*) FROM messages;"
sqlite3 /data/rembugbot.db "SELECT COUNT(*) FROM summary_windows;"

# Restart services
docker compose restart
```

## Backup Retention
- Backups are kept for 30 days in S3
- Lifecycle policy auto-deletes after 30 days
