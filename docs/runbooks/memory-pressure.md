# Runbook: Memory Pressure

## Symptoms
- Container OOM killed
- Slow response times
- Health check timeouts

## Diagnosis

```bash
# Check memory usage
docker stats --no-stream

# Check container limits
docker compose config | grep -A5 mem_limit

# Check for memory leaks
docker compose exec gateway node -e "console.log(process.memoryUsage())"
```

## Immediate Actions

### 1. Restart Services
```bash
docker compose restart
```

### 2. Reduce Load
```bash
# Pause bot in high-traffic groups
# Send .pause command in WhatsApp
```

### 3. Adjust Limits (if needed)
Edit `docker-compose.yml`:
```yaml
gateway:
  mem_limit: 512m  # Increase from 256m
  memswap_limit: 512m

worker:
  mem_limit: 1536m  # Increase from 1280m
  memswap_limit: 1536m
```

Then:
```bash
docker compose up -d
```

## Long-term Solutions
- Enable swap on host (1-2GB)
- Reduce concurrent job processing
- Implement message batching for large groups
- Consider upgrading instance size if consistently at limit
