#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Postly — Daily PostgreSQL Backup
# ──────────────────────────────────────────────────────────────
# Cron entry:  0 2 * * * /opt/postly/scripts/backup.sh >> /var/log/postly-backup.log 2>&1
#
# NOTE: Uses the shared PostgreSQL from the monitoring stack.
#       The container is named 'postgres' (not 'postly-postgres').
#       Credentials are sourced from monitoring/.env.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/postly/backups/local"
BACKUP_FILE="/tmp/postly_${DATE}.dump"
RETENTION_DAYS=7

# Optional: Discord/Slack webhook for failure alerts
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

echo "[${DATE}] Starting Postly backup..."

# ─── Load shared DB credentials from monitoring stack ─────────
MONITORING_ENV="/var/www/monitoring/.env"
if [ -f "$MONITORING_ENV" ]; then
  set -a
  . "$MONITORING_ENV"
  set +a
elif [ -f "/opt/monitoring/.env" ]; then
  set -a
  . "/opt/monitoring/.env"
  set +a
else
  # Fall back to postly's own .env
  if [ -f "/opt/postly/.env" ]; then
    set -a
    . "/opt/postly/.env"
    set +a
  fi
fi

# Defaults for postly database
DB_USER="${DB_USER:-postly}"
DB_NAME="${DB_NAME:-postly}"

# Create local backup directory
mkdir -p "${BACKUP_DIR}"

# ─── Step 1: Dump PostgreSQL ──────────────────────────────────
# Shared PostgreSQL container is named 'postgres' from monitoring stack
echo "→ Creating compressed PostgreSQL dump (from shared postgres container)..."
docker exec postgres pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -Fc --compress=9 \
  > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "  Dump created: ${BACKUP_SIZE}"

# ─── Step 2: Upload to remote storage (Backblaze B2) ────────
# Uncomment the following when rclone is configured:
#
# echo "→ Uploading to Backblaze B2..."
# rclone copy "${BACKUP_FILE}" b2:postly-backups/daily/
#
# # Verify upload
# if rclone ls b2:postly-backups/daily/ | grep -q "postly_${DATE}"; then
#   echo "  ✅ Upload verified"
# else
#   echo "  ❌ Upload verification failed!"
#   if [ -n "${ALERT_WEBHOOK}" ]; then
#     curl -s -X POST "${ALERT_WEBHOOK}" \
#       -H "Content-Type: application/json" \
#       -d "{\"content\": \"⚠️ Postly backup upload failed for ${DATE}\"}"
#   fi
# fi

# ─── Step 3: Local rolling retention ────────────────────────
echo "→ Copying to local backup directory..."
cp "${BACKUP_FILE}" "${BACKUP_DIR}/"

echo "→ Cleaning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "postly_*.dump" -mtime "+${RETENTION_DAYS}" -delete

# ─── Step 4: Clean up temp file ──────────────────────────────
rm -f "${BACKUP_FILE}"

# ─── Done ────────────────────────────────────────────────────
KEPT=$(ls -1 "${BACKUP_DIR}"/postly_*.dump 2>/dev/null | wc -l)
echo "✅ Backup complete. ${KEPT} backups retained locally."
echo ""
