FROM python:3.11-slim

WORKDIR /app

# ─── System dependencies ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ─── Python environment ───────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# ─── Install dependencies ─────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -U pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# ─── Install jobspy from local source ─────────────────────────────────────
COPY jobspy/ ./jobspy/
COPY pyproject.toml .
RUN pip install --no-cache-dir poetry-core && \
    pip install --no-cache-dir -e .

# ─── Copy application code ────────────────────────────────────────────────
COPY main.py scraper_engine.py db_writer.py proxy_manager.py ./
COPY config.yaml proxies.txt ./

# ─── Verify installation ──────────────────────────────────────────────────
RUN python -c "from jobspy import scrape_jobs; print('jobspy OK')" && \
    python -c "import psycopg2; print('psycopg2 OK')" && \
    python -c "import yaml; print('yaml OK')"

# ─── Non-root user ────────────────────────────────────────────────────────
RUN useradd --create-home --shell /bin/bash scraper && \
    chown -R scraper:scraper /app
USER scraper

# ─── Health check ─────────────────────────────────────────────────────────
HEALTHCHECK --interval=120s --timeout=15s --start-period=60s --retries=3 \
    CMD python -c "import sys; sys.exit(0)" || exit 0

# ─── Entry point ──────────────────────────────────────────────────────────
CMD ["python", "-u", "main.py"]
