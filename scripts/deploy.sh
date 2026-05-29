#!/usr/bin/env bash
# =============================================================================
# POSTLY — VPS Deployment Script
# =============================================================================
# One-command setup for a fresh VPS:
#   curl -fsSL https://... | bash
# Or locally:
#   ./scripts/deploy.sh
#
# What this does:
#   1. Checks prerequisites (Docker, Docker Compose)
#   2. Creates .env from template if missing
#   3. Generates secure random secrets
#   4. Builds and starts all services
#   5. Waits for healthy state
#   6. Prints access URLs and next steps
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }
info() { echo -e "${BLUE}[i]${NC} $*"; }

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           P O S T L Y   —   D E P L O Y M E N T              ║"
echo "║                                                              ║"
echo "║     AI-Powered Job Platform + Multi-Source Scraper           ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Prerequisites ────────────────────────────────────────────────────────────

check_command() {
    if ! command -v "$1" &>/dev/null; then
        err "$1 is not installed. Please install it first."
        exit 1
    fi
}

info "Checking prerequisites..."
check_command docker

# Check for Docker Compose (v2 or v1)
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    err "Docker Compose not found. Install Docker Compose v2."
    exit 1
fi

log "Docker:       $(docker --version)"
log "Compose:      $($DOCKER_COMPOSE version --short 2>/dev/null || echo 'v1')"

# ─── Environment Setup ────────────────────────────────────────────────────────

info "Setting up environment..."

if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        cp .env.production .env
        warn "Created .env from .env.production template"
    else
        err ".env.production template not found!"
        exit 1
    fi

    # Generate secure random secrets
    info "Generating secure secrets..."
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    JWT_REFRESH_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(16))")

    # Replace placeholders
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/change-this-to-a-secure-random-string/$JWT_SECRET/" .env
        sed -i '' "s/change-this-to-another-secure-string/$JWT_REFRESH_SECRET/" .env
        sed -i '' "s/change-this-to-a-secure-password/$DB_PASSWORD/" .env
    else
        sed -i "s/change-this-to-a-secure-random-string/$JWT_SECRET/" .env
        sed -i "s/change-this-to-another-secure-string/$JWT_REFRESH_SECRET/" .env
        sed -i "s/change-this-to-a-secure-password/$DB_PASSWORD/" .env
    fi
    log "Generated JWT secrets and DB password"
else
    log ".env file already exists, skipping generation"
fi

# Source the .env file
set -a
source .env
set +a

# ─── Build & Start ────────────────────────────────────────────────────────────

info "Building Docker images (this may take a few minutes on first run)..."
$DOCKER_COMPOSE build --parallel

info "Starting services..."
$DOCKER_COMPOSE up -d

# ─── Wait for Health ──────────────────────────────────────────────────────────

info "Waiting for services to be healthy..."

MAX_RETRIES=60
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:${API_PORT:-3000}/health > /dev/null 2>&1; then
        log "API is healthy!"
        break
    fi
    RETRY=$((RETRY + 1))
    if [ $((RETRY % 10)) -eq 0 ]; then
        info "Still waiting... (${RETRY}s)"
    fi
    sleep 1
done

if [ $RETRY -ge $MAX_RETRIES ]; then
    warn "API health check timed out. Check logs: $DOCKER_COMPOSE logs api"
fi

# ─── Verify Scraper ───────────────────────────────────────────────────────────

sleep 3
if curl -sf http://localhost:${API_PORT:-3000}/api/v1/scraper/stats > /dev/null 2>&1; then
    log "Scraper monitoring endpoint available"
else
    warn "Scraper endpoint not yet available (may need DB migrations)"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🚀  DEPLOYMENT COMPLETE                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  API:        http://localhost:${API_PORT:-3000}                         "
echo "║  Health:     http://localhost:${API_PORT:-3000}/health                  "
echo "║  Scraper:    http://localhost:${API_PORT:-3000}/api/v1/scraper/stats    "
echo "║                                                              ║"
echo "║  Quick Commands:                                             ║"
echo "║    make logs         → View all logs                         ║"
echo "║    make logs-scraper → View scraper logs                     ║"
echo "║    make status       → Check service status                  ║"
echo "║    make down         → Stop all services                     ║"
echo "║    make restart      → Restart all services                  ║"
echo "║                                                              ║"
echo "║  Services running:                                           ║"
$DOCKER_COMPOSE ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null | while read -r line; do
echo "║    $line"
done
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
log "Postly is running! Data collection begins immediately."
echo ""
