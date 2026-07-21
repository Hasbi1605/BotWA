# Runbook: Pairing Recovery

## Symptoms
- WhatsApp disconnected alert
- Bot not responding to commands
- Health check shows `whatsapp: disconnected`

## Recovery Steps

### 1. Check connection status
```bash
docker compose logs gateway --tail 50 | grep -i "connection\|pairing\|logout"
```

### 2. If logged out (requires re-pairing)
```bash
# Stop gateway
docker compose stop gateway

# Clear auth state (LAST RESORT - requires new QR scan)
rm -rf /data/auth/session/*

# Restart gateway
docker compose start gateway

# Monitor for QR code
docker compose logs -f gateway
```

### 3. If temporary disconnection
```bash
# Just restart gateway - will auto-reconnect with backoff
docker compose restart gateway
```

## Prevention
- Keep WhatsApp Web session active on a dedicated device
- Monitor connection health via alerts
- Don't run multiple instances with same auth
