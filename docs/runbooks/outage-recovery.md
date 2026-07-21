# Runbook: Outage Recovery

## Outage ≤ 6 Hours

Bot will automatically send delayed summary with label:
```
⚠️ RINGKASAN TERLAMBAT
```

### Verify
```bash
# Check summary windows
sqlite3 /data/rembugbot.db "
SELECT id, status, start_at, end_at, completed_at
FROM summary_windows
WHERE status = 'delayed_complete'
ORDER BY created_at DESC LIMIT 5;"
```

## Outage > 6 Hours

Bot sends recovery summary with label:
```
⚠️ RINGKASAN PEMULIHAN — MUNGKIN TIDAK LENGKAP
```

### Manual Recovery
If automatic recovery didn't trigger:

```bash
# 1. Check failed jobs
sqlite3 /data/rembugbot.db "
SELECT id, type, status, error_class, attempts
FROM jobs
WHERE status IN ('failed', 'retrying', 'failed_final')
ORDER BY created_at DESC LIMIT 10;"

# 2. Reset failed jobs to retry
sqlite3 /data/rembugbot.db "
UPDATE jobs SET status = 'pending', attempts = 0
WHERE status = 'failed_final'
AND created_at > datetime('now', '-24 hours');"

# 3. Restart to process pending jobs
docker compose restart gateway
```

## Full Service Recovery

```bash
# 1. Stop all services
docker compose down

# 2. Check disk space
df -h /data

# 3. Clean up if needed
./scripts/deploy.sh

# 4. Verify health
docker compose ps
docker compose logs --tail 20
```
