-- ============================================================================
-- MIGRATION: Add Scraper Support (JobSpy Integration)
-- ============================================================================
-- Extends the jobs table with scraper-specific fields and adds scraper run
-- tracking for observability into the 24/7 data collection pipeline.
-- ============================================================================

-- 1. Add scraper-specific columns to jobs table
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "job_url" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_url" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_interval" varchar(20);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_currency" varchar(10);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "salary_source" varchar(20);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_industry" varchar(255);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_num_employees" varchar(100);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_revenue" varchar(100);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_rating" numeric(3, 2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "company_reviews_count" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "experience_range" varchar(100);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "vacancy_count" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "work_from_home_type" varchar(50);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "job_function" varchar(255);

--> statement-breakpoint

-- 2. Create scraper_runs table for observability
CREATE TABLE IF NOT EXISTS "scraper_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "cycle_number" integer NOT NULL,
    "search_term" varchar(500) NOT NULL,
    "location" varchar(255) NOT NULL,
    "site" varchar(50) NOT NULL,
    "jobs_scraped" integer DEFAULT 0 NOT NULL,
    "jobs_inserted" integer DEFAULT 0 NOT NULL,
    "jobs_skipped" integer DEFAULT 0 NOT NULL,
    "proxy_count" integer DEFAULT 0 NOT NULL,
    "error_message" text,
    "duration_ms" integer,
    "scraper_version" varchar(20),
    "started_at" timestamp with time zone NOT NULL DEFAULT now(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

-- 3. Indexes for scraper queries
CREATE INDEX IF NOT EXISTS "idx_jobs_source_url" ON "jobs" USING btree ("source_url") WHERE "source_url" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_jobs_posted_at_site" ON "jobs" USING btree ("posted_at", "source") WHERE "posted_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_scraper_runs_cycle" ON "scraper_runs" USING btree ("cycle_number", "site");
CREATE INDEX IF NOT EXISTS "idx_scraper_runs_completed" ON "scraper_runs" USING btree ("completed_at");

--> statement-breakpoint

-- 4. Unique constraint on job source_url to prevent duplicates
-- (Only applies to non-null source_urls — scraper always provides these)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_jobs_source_url" ON "jobs" ("source_url") WHERE "source_url" IS NOT NULL;
