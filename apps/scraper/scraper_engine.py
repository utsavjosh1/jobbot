"""
Postly Scraper Engine — Core scraping logic.
Handles per-site scraping, retries, and result collection.
Writes results directly to PostgreSQL via DatabaseWriter.
"""

import logging
import random
import time
from datetime import datetime
from typing import Any, Optional

import pandas as pd
from jobspy import scrape_jobs

from db_writer import DatabaseWriter
from proxy_manager import ProxyManager

logger = logging.getLogger("PostlyScraper.Engine")

# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
]


class ScraperEngine:
    """Core scraper engine that orchestrates multi-site job scraping."""

    def __init__(self, config: dict, db_writer: DatabaseWriter, proxy_mgr: ProxyManager):
        self.cfg = config
        self.db = db_writer
        self.proxy_mgr = proxy_mgr
        self.cycle_count = 0

    def _get_random_ua(self) -> str:
        ua_cfg = self.cfg.get("user_agent", {})
        if ua_cfg.get("rotate", True):
            custom = ua_cfg.get("custom_list", [])
            agents = custom if custom else USER_AGENTS
            return random.choice(agents)
        return USER_AGENTS[0]

    def _build_params(
        self,
        search_term: str,
        google_term: str,
        location: str,
        site_name: list[str],
        proxies: Optional[list[str]] = None,
    ) -> dict:
        """Build scrape_jobs parameters from config."""
        search_cfg = self.cfg.get("search", {})
        params = {
            "site_name": site_name,
            "search_term": search_term,
            "google_search_term": google_term,
            "location": location,
            "results_wanted": search_cfg.get("results_wanted", 50),
            "country_indeed": search_cfg.get("country_indeed", "usa"),
            "description_format": search_cfg.get("description_format", "markdown"),
            "linkedin_fetch_description": search_cfg.get(
                "linkedin_fetch_description", False
            ),
            "enforce_annual_salary": search_cfg.get("enforce_annual_salary", False),
            "verbose": 2,
            "user_agent": self._get_random_ua(),
        }
        for opt_key in ("distance", "job_type", "hours_old", "easy_apply"):
            val = search_cfg.get(opt_key)
            if val is not None:
                params[opt_key] = val
        params["is_remote"] = search_cfg.get("is_remote", False) or False
        if proxies:
            params["proxies"] = proxies
        return params

    def _job_to_dict(self, row: Any, site: str) -> dict:
        """Convert a pandas row to a flat dictionary for DB insertion."""
        d = {}
        for col in row.index:
            val = row[col]
            if pd.isna(val):
                d[col] = None
            elif isinstance(val, (pd.Timestamp,)):
                d[col] = val.isoformat()
            elif hasattr(val, "item"):
                d[col] = val.item()
            else:
                d[col] = val
        d["site"] = site
        # Map 'company' to 'company_name' for consistency
        if "company" in d and "company_name" not in d:
            d["company_name"] = d["company"]
        return d

    def scrape_single_site(
        self,
        site: str,
        search_term: str,
        google_term: str,
        location: str,
        cycle_num: int,
    ) -> dict:
        """
        Scrape a single site and ingest results into DB.
        Returns summary dict with counts and error info.
        """
        delay_cfg = self.cfg.get("delays", {})
        time.sleep(random.uniform(
            delay_cfg.get("pre_cycle_min", 3),
            delay_cfg.get("pre_cycle_max", 10),
        ))

        all_proxies = self.proxy_mgr.pool.copy() if self.proxy_mgr.has_proxies() else []
        if all_proxies:
            random.shuffle(all_proxies)

        start_time = time.time()
        run_id = self.db.start_scraper_run(
            cycle_num, search_term, location, site, len(all_proxies)
        )

        jobs_scraped = 0
        error_msg = None

        try:
            params = self._build_params(
                search_term, google_term, location, [site], all_proxies or None
            )
            jobs_df = scrape_jobs(**params)

            if jobs_df is not None and not jobs_df.empty:
                jobs_scraped = len(jobs_df)
                jobs_list = [
                    self._job_to_dict(jobs_df.iloc[i], site)
                    for i in range(len(jobs_df))
                ]
                result = self.db.batch_ingest_jobs(jobs_list, site)
                logger.info(
                    "  ✓ %s: scraped=%d | inserted=%d | updated=%d | skipped=%d | errors=%d",
                    site,
                    jobs_scraped,
                    result["inserted"],
                    result["updated"],
                    result["skipped"],
                    result["errors"],
                )
            else:
                logger.info("  ~ %s: 0 jobs found", site)

        except Exception as e:
            error_msg = f"{e.__class__.__name__}: {str(e)[:200]}"
            logger.warning("  ✗ %s: %s", site, error_msg)

            # Retry without proxies for proxy-hostile sites
            if all_proxies:
                try:
                    logger.info("  ↻ %s: retrying without proxies...", site)
                    params = self._build_params(
                        search_term, google_term, location, [site], None
                    )
                    jobs_df = scrape_jobs(**params)
                    if jobs_df is not None and not jobs_df.empty:
                        jobs_scraped = len(jobs_df)
                        jobs_list = [
                            self._job_to_dict(jobs_df.iloc[i], site)
                            for i in range(len(jobs_df))
                        ]
                        result = self.db.batch_ingest_jobs(jobs_list, site)
                        logger.info(
                            "  ✓ %s (no-proxy fallback): scraped=%d | inserted=%d",
                            site,
                            jobs_scraped,
                            result["inserted"],
                        )
                        error_msg = None
                except Exception as e2:
                    logger.warning("  ✗ %s (no-proxy fallback also failed): %s", site, e2)

        duration_ms = int((time.time() - start_time) * 1000)

        if run_id:
            self.db.complete_scraper_run(
                run_id,
                jobs_scraped=jobs_scraped,
                jobs_inserted=jobs_scraped,  # approximate; batch_ingest returns per-job counts
                jobs_skipped=0,
                duration_ms=duration_ms,
                error_message=error_msg,
            )

        return {
            "site": site,
            "jobs_scraped": jobs_scraped,
            "error": error_msg,
            "duration_ms": duration_ms,
        }

    def run_cycle(
        self,
        search_term: str,
        google_term: str,
        location: str,
        sites: list[str],
    ) -> dict:
        """
        Run a complete scrape cycle: one search term × one location across all sites.
        """
        cycle_start = time.time()
        self.cycle_count += 1
        cycle_num = self.cycle_count

        logger.info("=" * 70)
        logger.info(
            "CYCLE #%d | %s",
            cycle_num,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        logger.info("  Search: '%s'", search_term)
        logger.info("  Location: '%s'", location)
        logger.info("  Sites (%d): %s", len(sites), sites)
        logger.info(
            "  Proxies: %d",
            len(self.proxy_mgr.pool) if self.proxy_mgr.has_proxies() else 0,
        )
        logger.info("=" * 70)

        results = []
        for site in sites:
            result = self.scrape_single_site(
                site, search_term, google_term, location, cycle_num
            )
            results.append(result)

        total_jobs = sum(r["jobs_scraped"] for r in results)
        duration = int((time.time() - cycle_start) * 1000)
        sites_with_data = sum(1 for r in results if r["jobs_scraped"] > 0)
        sites_with_errors = sum(1 for r in results if r["error"])

        logger.info(
            "CYCLE #%d COMPLETE: %d jobs | %d/%d sites with data | %d errors | %dms",
            cycle_num,
            total_jobs,
            sites_with_data,
            len(sites),
            sites_with_errors,
            duration,
        )

        return {
            "cycle": cycle_num,
            "total_jobs": total_jobs,
            "sites_with_data": sites_with_data,
            "sites_with_errors": sites_with_errors,
            "duration_ms": duration,
            "results": results,
        }
