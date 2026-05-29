# =============================================================================
# POSTLY — Makefile
# =============================================================================
# Usage:
#   make up           Start all services (api, db, redis, scraper)
#   make up-core      Start core only (api, db, redis)
#   make up-full      Start everything including Discord bot
#   make down         Stop all services
#   make build        Build all images
#   make logs         Tail all logs
#   make restart      Restart all services
#   make status       Show service status + scraper stats
#   make clean        Remove all containers, volumes, images
# =============================================================================

.PHONY: up up-core up-full down build logs restart clean status

# ─── Start ────────────────────────────────────────────────────────────────────

up:
	@echo "🚀 Starting Postly..."
	docker compose up -d --build
	@echo ""
	@echo "✅ Postly running on http://localhost:3000"
	@echo "   make logs     View all logs"
	@echo "   make status   Check services"

up-core:
	@echo "🚀 Starting Postly (core: api + db + redis)..."
	docker compose up -d --build api postgres redis
	@echo "✅ Core services running"

up-full:
	@echo "🚀 Starting Postly (full stack + bot)..."
	docker compose --profile full up -d --build
	@echo "✅ Full stack running (api + scraper + bot)"

# ─── Stop ─────────────────────────────────────────────────────────────────────

down:
	docker compose --profile full down

down-volumes:
	docker compose --profile full down -v

# ─── Build ────────────────────────────────────────────────────────────────────

build:
	docker compose --profile full build --no-cache

# ─── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose --profile full logs -f --tail=50

logs-api:
	docker compose logs -f api --tail=50

logs-scraper:
	docker compose logs -f scraper --tail=50

logs-db:
	docker compose logs -f postgres --tail=50

# ─── Status ───────────────────────────────────────────────────────────────────

status:
	docker compose ps
	@echo ""
	@echo "📊 Scraper stats:"
	@curl -s http://localhost:3000/api/v1/scraper/stats 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "   API not reachable yet"

# ─── Restart ──────────────────────────────────────────────────────────────────

restart:
	docker compose --profile full restart

restart-api:
	docker compose restart api

restart-scraper:
	docker compose restart scraper

# ─── Shell ────────────────────────────────────────────────────────────────────

shell-api:
	docker compose exec api sh

shell-scraper:
	docker compose exec scraper bash

shell-db:
	docker compose exec postgres psql -U postly -d postly

# ─── Database ─────────────────────────────────────────────────────────────────

db-stats:
	@docker compose exec postgres psql -U postly -d postly -c "\
		SELECT '📦 Total jobs' as metric, COUNT(*) as value FROM jobs \
		UNION ALL \
		SELECT '✅ Active jobs', COUNT(*) FROM jobs WHERE is_active = true \
		UNION ALL \
		SELECT '🔄 Scraper runs', COUNT(*) FROM scraper_runs \
		UNION ALL \
		SELECT '🕐 Last scrape', to_char(MAX(completed_at), 'YYYY-MM-DD HH24:MI:SS') FROM scraper_runs;"

db-reset:
	@echo "⚠️  This deletes ALL data!"
	@read -p "Type 'yes' to confirm: " c; [ "$$c" = "yes" ] && docker compose --profile full down -v && echo "✅ Reset. Run 'make up'." || echo "❌ Cancelled."

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	docker compose --profile full down -v --rmi all
	@echo "✅ All containers, volumes, and images removed."
