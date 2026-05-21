# Postly — Production Deployment Guide

Complete runbook for deploying Postly to a VPS.

---

## Architecture Overview

```
VPS Proxy (Nginx/Traefik) → API (Express) → Static Web (Vite build)

Internal Docker Network:
  API ←→ PostgreSQL (pgvector)
  API ←→ Redis (BullMQ + Caching)
  Bot ←→ PostgreSQL + Redis
```

**Stack:** Node.js API · Python Discord Bot · PostgreSQL 16 + pgvector · Redis 7

---

## Quick-Start Checklist

```
□  1. Clone repo to /var/www/postly, create .env
□  2. docker compose -f docker-compose.prod.yml up -d
□  3. Verify all services healthy
□  4. Configure GitHub Actions secrets
□  5. Push to main → verify pipeline runs
□  6. Set up cron backup job
□  7. Run a backup restore drill
```

---

## Step-by-Step Deployment

### 1. Clone and Configure

Log into your VPS and run:

```bash
cd /var/www/postly
git clone https://github.com/<your-repo>.git .

# Create production .env from template
cp .env.production.example .env
chmod 600 .env

# Edit .env — fill in all CHANGE_ME values
nano .env
```

**Critical .env values to set:**

- `DB_PASSWORD` — Strong random password (`openssl rand -hex 16`)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — (`openssl rand -hex 32`)
- `DISCORD_BOT_TOKEN` — From Discord Developer Portal
- `WEB_URL` — Your production domain (e.g., `https://postly.io`)

### 2. Login to Docker Hub

```bash
# Login to pull pre-built images from Docker Hub
echo "<YOUR_PAT>" | docker login -u <dockerhub-username> --password-stdin
```

### 3. Start the Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Verify all services are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:3000/health | jq
```

Expected health response:

```json
{
  "status": "ok",
  "checks": { "db": "ok", "redis": "ok" },
  "uptime": 12.345
}
```

### 4. Run Database Migrations

```bash
docker exec postly-api npm run migrate:up
```

### 5. Setup Backups

```bash
# Make backup script executable
chmod +x scripts/backup.sh

# Test it manually first
bash scripts/backup.sh

# Add to cron (runs daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/postly/scripts/backup.sh >> /var/log/postly-backup.log 2>&1") | crontab -
```

### 6. Configure GitHub Actions

Add these secrets in **Settings → Secrets → Actions**:

| Secret        | Value                      |
| ------------- | -------------------------- |
| `VPS_HOST`    | Your VPS IP address        |
| `VPS_USER`    | `deploy`                   |
| `VPS_PORT`    | `22`                       |
| `VPS_SSH_KEY` | Full private SSH key (PEM) |

Push to `main` and verify the pipeline deploys successfully.

---

## Rollback

Every deploy tags images with the Git SHA. To rollback:

```bash
cd /var/www/postly
export API_IMAGE=<dockerhub-username>/postly-api:<previous-sha>

export BOT_IMAGE=<dockerhub-username>/postly-bot:<previous-sha>
docker compose -f docker-compose.prod.yml up -d --no-deps api bot
```

---

## Backup Restore Drill

Run this monthly to verify backups work:

```bash
# Start a throwaway Postgres container
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16

# Restore latest backup into it
docker exec -i pg-restore-test pg_restore -U postgres -d postgres --create < backups/local/$(ls -t backups/local/ | head -1)

# Verify data
docker exec pg-restore-test psql -U postgres -d postly -c "SELECT count(*) FROM users;"

# Clean up
docker rm -f pg-restore-test
```

---

## Scaling Roadmap

| Users   | Action                                          | Cost Impact |
| ------- | ----------------------------------------------- | ----------- |
| 0–1K    | Current setup, no changes                       | —           |
| 1K–10K  | Add Postgres read replica (second VPS)          | +€4.5/mo    |
| 10K–50K | Add pgBouncer                                   | +€4.5/mo    |
| 50K+    | Consider managed DB, split into domain services | Variable    |

---

## File Reference

| File                           | Purpose                  |
| ------------------------------ | ------------------------ |
| `docker-compose.prod.yml`      | Main production stack    |
| `scripts/backup.sh`            | Daily PostgreSQL backup  |
| `.env.production.example`      | Production env template  |
| `.github/workflows/deploy.yml` | CI/CD pipeline           |
| `.github/workflows/ci.yml`     | PR checks                |
| `.github/SECRETS.md`           | GitHub secrets reference |
