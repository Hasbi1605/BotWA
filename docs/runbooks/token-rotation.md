# Runbook: Token Rotation

## When to Rotate
- GitHub token compromised
- Token quota exhausted
- Token expired

## Steps

### 1. Generate new token
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create new token with `models:read` scope
3. Copy token immediately (won't be shown again)

### 2. Update environment
```bash
# Edit .env file
nano docker/.env

# Update token (rotate one at a time)
GH_MODELS_TOKEN_A=ghp_new_token_here
```

### 3. Restart worker
```bash
docker compose restart worker
```

### 4. Verify
```bash
# Test with a manual summary
# Send .ringkas sekarang in WhatsApp group

# Check provider health
docker compose logs worker | grep -i "provider\|token\|auth"
```

### 5. Rotate second token (if needed)
Repeat steps 1-4 for `GH_MODELS_TOKEN_B`.

## Circuit Breaker
If a token is disabled by circuit breaker (401/403):
1. Fix the token issue
2. Restart worker to reset circuit breaker state
