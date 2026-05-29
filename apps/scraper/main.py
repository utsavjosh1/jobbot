#!/usr/bin/env python3
"""
Postly Scraper — 24/7 Multi-Platform Job Data Collection Engine
================================================================
Runs continuously, cycling through search terms × locations across all
supported job platforms. Results are written directly to the PostgreSQL
database for use by the Postly application.

Usage:
    python main.py [--config config.yaml] [--once]

Options:
    --config PATH    Path to config file (default: config.yaml)
    --once           Run a single cycle and exit (for testing/CRON)
    --dry-run        Scrape but don't write to database
"""

import argparse
import logging
import os
import random
import signal
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

from db_writer import DatabaseWriter
from proxy_manager import ProxyManager
from scraper_engine import ScraperEngine

# ─── Logger Setup ──────────────────────────────────────────────────────────────

def setup_logger(level: str = "INFO", fmt: str = "structured"):
    """Configure logging. In 'structured' mode, outputs JSON lines."""
    logger = logging.getLogger("PostlyScraper")
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        if fmt == "structured":
            formatter = logging.Formatter(
                '{"ts":"%(asctime)s","level":"%(levelname)s",'
                '"logger":"%(name)s","msg":"%(message)s"}',
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        else:
            formatter = logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


# ─── Config ────────────────────────────────────────────────────────────────────

def load_config(path: str) -> dict:
    path = Path(path)
    if not path.exists():
        print(f"ERROR: Config file not found: {path}", file=sys.stderr)
        sys.exit(1)
    with open(path, "r") as f:
        cfg = yaml.safe_load(f)
    # Resolve relative paths relative to config file location
    cfg["_config_dir"] = str(path.parent)
    return cfg


# ─── Cycle State ───────────────────────────────────────────────────────────────

class CycleState:
    """Manages rotation through search terms and locations."""

    def __init__(self, search_cfg: dict):
        self.search_terms = search_cfg.get("search_terms", ["software engineer"])
        self.google_terms = search_cfg.get(
            "google_search_terms", ["software engineer jobs"]
        )
        self.locations = search_cfg.get("locations", ["United States"])
        self.term_idx = 0
        self.loc_idx = 0
        self.google_idx = 0
        random.shuffle(self.search_terms)

    def next(self) -> tuple[str, str, str]:
        """Return (search_term, google_term, location) for the next cycle."""
        term = self.search_terms[self.term_idx % len(self.search_terms)]
        self.term_idx += 1
        gterm = self.google_terms[self.google_idx % len(self.google_terms)]
        self.google_idx += 1
        loc = self.locations[self.loc_idx % len(self.locations)]
        self.loc_idx += 1
        return term, gterm, loc


# ─── Shutdown Handler ──────────────────────────────────────────────────────────

_shutdown_requested = False


def handle_shutdown(signum, frame):
    global _shutdown_requested
    _shutdown_requested = True
    logging.getLogger("PostlyScraper").info(
        "Shutdown signal received (%s). Finishing current cycle...", signum
    )


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Postly Scraper — 24/7 Job Data Collection Engine"
    )
    parser.add_argument(
        "--config", default="config.yaml", help="Path to config file"
    )
    parser.add_argument(
        "--once", action="store_true", help="Run a single cycle and exit"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape but don't write to database (for testing)",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    log_cfg = cfg.get("logging", {})
    logger = setup_logger(
        level=log_cfg.get("level", "INFO"),
        fmt=log_cfg.get("format", "structured"),
    )

    logger.info("╔══════════════════════════════════════════════════════════════╗")
    logger.info("║        POSTLY SCRAPER — 24/7 DATA COLLECTION ENGINE          ║")
    logger.info("╚══════════════════════════════════════════════════════════════╝")

    search_cfg = cfg.get("search", {})
    sites = search_cfg.get("site_name", ["indeed"])
    schedule_cfg = cfg.get("schedule", {})

    # Allow env var override for VPS tuning
    scraper_interval = os.environ.get("SCRAPER_INTERVAL_SECONDS")
    if scraper_interval:
        schedule_cfg["interval_seconds"] = int(scraper_interval)

    state = CycleState(search_cfg)
    total_terms = len(state.search_terms)
    total_locs = len(state.locations)
    logger.info(
        "Configuration: %d search terms × %d locations × %d sites = %d unique queries",
        total_terms,
        total_locs,
        len(sites),
        total_terms * total_locs * len(sites),
    )
    logger.info(
        "Schedule: every %ds (±%d%% jitter)",
        schedule_cfg.get("interval_seconds", 7200),
        schedule_cfg.get("jitter_percent", 20),
    )

    # Initialize proxy manager
    proxy_mgr = ProxyManager(cfg.get("proxies", {}))
    if not proxy_mgr.has_proxies():
        logger.warning(
            "⚠ No proxies available. Scraping will proceed with TLS + UA rotation only."
        )

    # Initialize database writer (skip if dry-run)
    db_writer = None
    if not args.dry_run:
        try:
            db_writer = DatabaseWriter(cfg)
            job_count = db_writer.get_job_count()
            logger.info("Database: connected. %d jobs currently in dataset", job_count)
        except Exception as e:
            logger.error("Database connection failed: %s", e)
            logger.error(
                "Set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD env vars "
                "or configure database section in config.yaml"
            )
            sys.exit(1)
    else:
        logger.info("DRY RUN MODE — scraping but NOT writing to database")

    # Initialize scraper engine
    engine = ScraperEngine(cfg, db_writer, proxy_mgr)

    # Register shutdown handlers
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # ─── Main Loop ──────────────────────────────────────────────────────────
    global _shutdown_requested
    total_cycles = 0
    total_jobs_all_time = 0

    while not _shutdown_requested:
        total_cycles += 1
        search_term, google_term, location = state.next()

        logger.info("")
        logger.info("#" * 70)
        logger.info("  CYCLE #%d  |  All-time: %d cycles, ~%d jobs",
                     total_cycles, total_cycles, total_jobs_all_time)
        logger.info("#" * 70)

        summary = engine.run_cycle(search_term, google_term, location, sites)
        total_jobs_all_time += summary["total_jobs"]

        if args.once:
            logger.info("--once flag set: exiting after single cycle")
            break

        if _shutdown_requested:
            break

        # Wait for next cycle with jitter
        base = schedule_cfg.get("interval_seconds", 7200)
        jitter_pct = schedule_cfg.get("jitter_percent", 20)
        jitter = base * jitter_pct / 100.0
        delay = base + random.uniform(-jitter, jitter)
        next_time = time.time() + delay
        logger.info(
            "Next cycle at %s (in %.0fs = %.1f min)",
            datetime.fromtimestamp(next_time).strftime("%Y-%m-%d %H:%M:%S"),
            delay,
            delay / 60,
        )

        # Sleep in chunks to allow graceful shutdown
        sleep_chunk = 10
        while delay > 0 and not _shutdown_requested:
            time.sleep(min(sleep_chunk, delay))
            delay -= sleep_chunk

    # ─── Shutdown ───────────────────────────────────────────────────────────
    logger.info(
        "Shutting down. Total: %d cycles, ~%d jobs collected",
        total_cycles,
        total_jobs_all_time,
    )
    if db_writer:
        db_writer.close()
    logger.info("Postly Scraper stopped. Goodbye.")


if __name__ == "__main__":
    main()
