"""
PostgreSQL writer for the Postly scraper.
Handles job deduplication (by source_url), batch insertion, and scraper run tracking.
"""

import hashlib
import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg2
import psycopg2.extras
import psycopg2.pool

logger = logging.getLogger("PostlyScraper.DB")

# Map jobspy site names to Postly job_source enum values
SITE_TO_SOURCE = {
    "linkedin": "linkedin",
    "indeed": "indeed",
    "zip_recruiter": "zip_recruiter",
    "glassdoor": "glassdoor",
    "google": "google_jobs",
    "bayt": "bayt",
    "naukri": "naukri",
    "bdjobs": "bdjobs",
}

SCRAPER_VERSION = "1.0.0"


class DatabaseWriter:
    """Writes scraped jobs directly to PostgreSQL with deduplication."""

    def __init__(self, config: dict):
        db_cfg = config.get("database", {})
        self.pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=db_cfg.get("min_connections", 2),
            maxconn=db_cfg.get("max_connections", 5),
            host=os.environ.get("DB_HOST", db_cfg.get("host", "localhost")),
            port=int(os.environ.get("DB_PORT", db_cfg.get("port", 5432))),
            dbname=os.environ.get("DB_NAME", db_cfg.get("name", "postly")),
            user=os.environ.get("DB_USER", db_cfg.get("user", "postgres")),
            password=os.environ.get(
                "DB_PASSWORD", db_cfg.get("password", "postgres")
            ),
        )
        logger.info(
            "Database connection pool ready (min=%d, max=%d)",
            db_cfg.get("min_connections", 2),
            db_cfg.get("max_connections", 5),
        )

    @contextmanager
    def _get_conn(self):
        """Get a connection from the pool with auto-commit."""
        conn = self.pool.getconn()
        conn.autocommit = False
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.pool.putconn(conn)

    def _sanitize_text(self, text: Optional[str]) -> Optional[str]:
        """Sanitize text to remove null bytes and truncate to safe length."""
        if text is None:
            return None
        text = text.replace("\x00", "")
        return text[:65535] if len(text) > 65535 else text

    def _compute_fingerprint(
        self, title: str, company: str, location: str, source_url: str
    ) -> str:
        """Compute a SHA-256 fingerprint for deduplication."""
        raw = f"{title}|{company}|{location}|{source_url}".lower()
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def upsert_job(self, job_data: dict) -> dict:
        """
        Insert or update a single job by source_url.
        Returns {"action": "inserted"|"updated"|"skipped", "id": str}
        """
        source_url = job_data.get("job_url", "")
        if not source_url:
            return {"action": "skipped", "id": None}

        source = SITE_TO_SOURCE.get(job_data.get("site", ""), "generic")
        title = self._sanitize_text(job_data.get("title", "Untitled"))
        company = self._sanitize_text(job_data.get("company", "")) or job_data.get(
            "company_name", "Unknown"
        )
        description = self._sanitize_text(job_data.get("description", "")) or ""
        location = self._sanitize_text(job_data.get("location", ""))
        fingerprint = self._compute_fingerprint(title, company, location or "", source_url)

        # Parse compensation
        salary_min = job_data.get("min_amount")
        salary_max = job_data.get("max_amount")
        salary_interval = job_data.get("interval")
        salary_currency = job_data.get("currency", "USD")
        salary_source = job_data.get("salary_source")

        # Parse job type
        job_type_raw = job_data.get("job_type")
        if isinstance(job_type_raw, list):
            job_type = ", ".join(job_type_raw) if job_type_raw else None
        else:
            job_type = str(job_type_raw) if job_type_raw else None

        # Date posted
        date_posted = job_data.get("date_posted")
        if date_posted and not isinstance(date_posted, datetime):
            try:
                date_posted = datetime.fromisoformat(str(date_posted))
            except (ValueError, TypeError):
                date_posted = None

        # Skills
        skills = job_data.get("skills")
        if isinstance(skills, str) and skills:
            skills = [s.strip() for s in skills.split(",") if s.strip()]
        elif not isinstance(skills, list):
            skills = None

        with self._get_conn() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Check if job exists by source_url
                cur.execute(
                    'SELECT id FROM jobs WHERE source_url = %s LIMIT 1',
                    (source_url,),
                )
                existing = cur.fetchone()

                if existing:
                    # Update existing job
                    cur.execute(
                        """
                        UPDATE jobs SET
                            title = %s, company_name = %s, description = %s,
                            location = %s, salary_min = %s, salary_max = %s,
                            salary_interval = %s, salary_currency = %s,
                            salary_source = %s, job_type = %s,
                            remote = %s, job_url = %s, company_url = %s,
                            company_logo_url = %s, company_description = %s,
                            company_industry = %s, company_num_employees = %s,
                            company_revenue = %s, company_rating = %s,
                            company_reviews_count = %s, skills_required = %s,
                            experience_required = %s, experience_range = %s,
                            vacancy_count = %s, work_from_home_type = %s,
                            job_function = %s, posted_at = %s,
                            fingerprint = %s, is_active = TRUE,
                            updated_at = NOW()
                        WHERE source_url = %s
                        """,
                        (
                            title,
                            company,
                            description,
                            location,
                            str(salary_min) if salary_min is not None else None,
                            str(salary_max) if salary_max is not None else None,
                            salary_interval,
                            salary_currency,
                            salary_source,
                            job_type,
                            bool(job_data.get("is_remote", False)),
                            source_url,
                            job_data.get("company_url"),
                            job_data.get("company_logo"),
                            self._sanitize_text(
                                job_data.get("company_description")
                            ),
                            job_data.get("company_industry"),
                            job_data.get("company_num_employees"),
                            job_data.get("company_revenue"),
                            (
                                str(job_data.get("company_rating"))
                                if job_data.get("company_rating") is not None
                                else None
                            ),
                            job_data.get("company_reviews_count"),
                            json.dumps(skills) if skills else None,
                            job_data.get("experience_range"),
                            job_data.get("experience_range"),
                            job_data.get("vacancy_count"),
                            job_data.get("work_from_home_type"),
                            job_data.get("job_function"),
                            date_posted,
                            fingerprint,
                            source_url,
                        ),
                    )
                    return {"action": "updated", "id": existing["id"]}

                # Insert new job
                cur.execute(
                    """
                    INSERT INTO jobs (
                        title, company_name, description, location,
                        salary_min, salary_max, salary_interval,
                        salary_currency, salary_source, job_type,
                        remote, source, source_url, job_url,
                        company_url, company_logo_url, company_description,
                        company_industry, company_num_employees,
                        company_revenue, company_rating,
                        company_reviews_count, skills_required,
                        experience_required, experience_range,
                        vacancy_count, work_from_home_type,
                        job_function, posted_at, fingerprint, is_active
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, TRUE
                    )
                    ON CONFLICT DO NOTHING
                    RETURNING id
                    """,
                    (
                        title,
                        company,
                        description,
                        location,
                        str(salary_min) if salary_min is not None else None,
                        str(salary_max) if salary_max is not None else None,
                        salary_interval,
                        salary_currency,
                        salary_source,
                        job_type,
                        bool(job_data.get("is_remote", False)),
                        source,
                        source_url,
                        source_url,
                        job_data.get("company_url"),
                        job_data.get("company_logo"),
                        self._sanitize_text(job_data.get("company_description")),
                        job_data.get("company_industry"),
                        job_data.get("company_num_employees"),
                        job_data.get("company_revenue"),
                        (
                            str(job_data.get("company_rating"))
                            if job_data.get("company_rating") is not None
                            else None
                        ),
                        job_data.get("company_reviews_count"),
                        json.dumps(skills) if skills else None,
                        job_data.get("experience_range"),
                        job_data.get("experience_range"),
                        job_data.get("vacancy_count"),
                        job_data.get("work_from_home_type"),
                        job_data.get("job_function"),
                        date_posted,
                        fingerprint,
                    ),
                )
                result = cur.fetchone()
                if result:
                    return {"action": "inserted", "id": result["id"]}
                return {"action": "skipped", "id": None}

    def batch_ingest_jobs(
        self, jobs: list[dict], site: str
    ) -> dict:
        """
        Ingest a batch of scraped jobs.
        Returns {"inserted": int, "updated": int, "skipped": int, "errors": int}
        """
        inserted = 0
        updated = 0
        skipped = 0
        errors = 0

        for job in jobs:
            job["site"] = site
            try:
                result = self.upsert_job(job)
                if result["action"] == "inserted":
                    inserted += 1
                elif result["action"] == "updated":
                    updated += 1
                else:
                    skipped += 1
            except Exception as e:
                logger.warning("Failed to ingest job '%s': %s", job.get("title", "?"), e)
                errors += 1

        return {
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "errors": errors,
        }

    def start_scraper_run(
        self,
        cycle_number: int,
        search_term: str,
        location: str,
        site: str,
        proxy_count: int,
    ) -> Optional[str]:
        """Create a scraper_run record and return its ID."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO scraper_runs (
                        cycle_number, search_term, location, site,
                        proxy_count, scraper_version, started_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    """,
                    (
                        cycle_number,
                        search_term,
                        location,
                        site,
                        proxy_count,
                        SCRAPER_VERSION,
                    ),
                )
                row = cur.fetchone()
                return row[0] if row else None

    def complete_scraper_run(
        self,
        run_id: str,
        jobs_scraped: int,
        jobs_inserted: int,
        jobs_skipped: int,
        duration_ms: int,
        error_message: Optional[str] = None,
    ):
        """Mark a scraper run as completed with results."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE scraper_runs SET
                        jobs_scraped = %s,
                        jobs_inserted = %s,
                        jobs_skipped = %s,
                        duration_ms = %s,
                        error_message = %s,
                        completed_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        jobs_scraped,
                        jobs_inserted,
                        jobs_skipped,
                        duration_ms,
                        error_message,
                        run_id,
                    ),
                )

    def get_job_count(self) -> int:
        """Get total count of scraped jobs in the database."""
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM jobs WHERE source_url IS NOT NULL"
                )
                return cur.fetchone()[0]

    def close(self):
        """Close the connection pool."""
        if self.pool:
            self.pool.closeall()
            logger.info("Database connection pool closed")
