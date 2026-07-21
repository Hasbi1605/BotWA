# Runbook: AWS Migration

## Pre-Migration Checklist
- [ ] Backup database to S3
- [ ] Export auth state
- [ ] Document current DNS/endpoints
- [ ] Prepare target environment

## Migration Steps

### 1. Create Backup
```bash
./scripts/backup.sh
```

### 2. Export Auth State
```bash
# Copy auth state
tar -czf /tmp/wa-auth.tar.gz /data/auth/
aws s3 cp /tmp/wa-auth.tar.gz s3://rembugbot-backups/auth/ --sse AES256
```

### 3. Setup New Instance

#### Option A: EC2
```bash
# Launch new EC2 instance (t4g.small, Ubuntu ARM64)
# Attach EBS volume (encrypted, 20GB)

# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose-v2

# Clone repo
git clone https://github.com/Hasbi1605/BotWA.git
cd BotWA/docker

# Restore database
aws s3 cp s3://rembugbot-backups/database/latest.tar.gz /tmp/
./scripts/restore.sh latest.tar.gz

# Restore auth state
aws s3 cp s3://rembugbot-backups/auth/wa-auth.tar.gz /tmp/
tar -xzf /tmp/wa-auth.tar.gz -C /data/

# Configure .env
cp .env.example .env
nano .env

# Start services
docker compose up -d
```

#### Option B: Local/VPS
Same as above but without AWS-specific IAM/SSM setup.

### 4. Verify Migration
```bash
# Check health
docker compose exec gateway curl http://localhost:3000/health/ready
docker compose exec worker python -c "import httpx; print(httpx.get('http://localhost:8000/health/ready').json())"

# Check WhatsApp connection
docker compose logs gateway | grep -i "connected"

# Test manual summary
# Send .ringkas sekarang in WhatsApp
```

### 5. Update DNS/Endpoints
If using custom domain, update DNS records.

### 6. Decommission Old Instance
```bash
# On old instance
docker compose down
# Terminate EC2 instance or stop services
```

## Rollback
If migration fails:
1. Start old instance
2. Restore from backup if needed
3. Investigate issues before reattempting
