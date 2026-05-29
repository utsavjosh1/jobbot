import { eq, sql } from "drizzle-orm";
import { db } from "../index.js";
import { jobs, scraper_runs } from "../schema.js";
import type { ScraperRun, ScrapedJobInput } from "@postly/shared-types";

/**
 * Scraper-specific database queries for job ingestion and run tracking.
 * These are designed to be called by the Python scraper via HTTP or directly
 * from Node.js worker processes.
 */
export const scraperQueries = {
  /**
   * Upsert a scraped job into the database.
   * Uses source_url as the natural key for deduplication.
   * If a job with the same source_url exists, it updates the record.
   * Otherwise, it inserts a new row.
   *
   * Returns: { id, action: "inserted" | "updated" | "skipped" }
   */
  async ingestJob(input: ScrapedJobInput): Promise<{
    id: string;
    action: "inserted" | "updated" | "skipped";
  }> {
    // Check for existing job by source_url
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.source_url, input.source_url))
      .limit(1);

    if (existing) {
      // Update existing job with fresh data
      await db
        .update(jobs)
        .set({
          title: input.title,
          company_name: input.company_name,
          description: input.description,
          location: input.location ?? null,
          salary_min: input.salary_min?.toString() ?? null,
          salary_max: input.salary_max?.toString() ?? null,
          salary_interval: input.salary_interval ?? null,
          salary_currency: input.salary_currency ?? null,
          salary_source: input.salary_source ?? null,
          job_type: input.job_type ?? null,
          remote: input.remote ?? false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          source: input.source as any,
          job_url: input.job_url ?? null,
          company_url: input.company_url ?? null,
          company_logo_url: input.company_logo_url ?? null,
          company_description: input.company_description ?? null,
          company_industry: input.company_industry ?? null,
          company_num_employees: input.company_num_employees ?? null,
          company_revenue: input.company_revenue ?? null,
          company_rating: input.company_rating?.toString() ?? null,
          company_reviews_count: input.company_reviews_count ?? null,
          skills_required: input.skills_required ?? null,
          experience_required: input.experience_required ?? null,
          experience_range: input.experience_range ?? null,
          vacancy_count: input.vacancy_count ?? null,
          work_from_home_type: input.work_from_home_type ?? null,
          job_function: input.job_function ?? null,
          posted_at: input.posted_at ? new Date(input.posted_at) : null,
          is_active: true,
          fingerprint: input.fingerprint ?? null,
          updated_at: new Date(),
        })
        .where(eq(jobs.source_url, input.source_url));

      return { id: existing.id, action: "updated" };
    }

    // Insert new job
    const [inserted] = await db
      .insert(jobs)
      .values({
        title: input.title,
        company_name: input.company_name,
        description: input.description,
        location: input.location ?? null,
        salary_min: input.salary_min?.toString() ?? null,
        salary_max: input.salary_max?.toString() ?? null,
        salary_interval: input.salary_interval ?? null,
        salary_currency: input.salary_currency ?? null,
        salary_source: input.salary_source ?? null,
        job_type: input.job_type ?? null,
        remote: input.remote ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        source: input.source as any,
        source_url: input.source_url,
        job_url: input.job_url ?? null,
        company_url: input.company_url ?? null,
        company_logo_url: input.company_logo_url ?? null,
        company_description: input.company_description ?? null,
        company_industry: input.company_industry ?? null,
        company_num_employees: input.company_num_employees ?? null,
        company_revenue: input.company_revenue ?? null,
        company_rating: input.company_rating?.toString() ?? null,
        company_reviews_count: input.company_reviews_count ?? null,
        skills_required: input.skills_required ?? null,
        experience_required: input.experience_required ?? null,
        experience_range: input.experience_range ?? null,
        vacancy_count: input.vacancy_count ?? null,
        work_from_home_type: input.work_from_home_type ?? null,
        job_function: input.job_function ?? null,
        posted_at: input.posted_at ? new Date(input.posted_at) : null,
        is_active: true,
        fingerprint: input.fingerprint ?? null,
      })
      .returning({ id: jobs.id });

    return { id: inserted.id, action: "inserted" };
  },

  /**
   * Batch ingest multiple scraped jobs within a single transaction.
   * Each job is individually upserted by source_url.
   */
  async batchIngestJobs(inputs: ScrapedJobInput[]): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const input of inputs) {
      try {
        const result = await this.ingestJob(input);
        if (result.action === "inserted") inserted++;
        else if (result.action === "updated") updated++;
        else skipped++;
      } catch {
        errors++;
      }
    }

    return { inserted, updated, skipped, errors };
  },

  /**
   * Create a scraper run record (called at the start of a cycle for a site).
   */
  async startRun(
    cycleNumber: number,
    searchTerm: string,
    location: string,
    site: string,
    proxyCount: number,
    scraperVersion?: string,
  ): Promise<string> {
    const [run] = await db
      .insert(scraper_runs)
      .values({
        cycle_number: cycleNumber,
        search_term: searchTerm,
        location,
        site,
        proxy_count: proxyCount,
        scraper_version: scraperVersion ?? null,
        jobs_scraped: 0,
        jobs_inserted: 0,
        jobs_skipped: 0,
        started_at: new Date(),
      })
      .returning({ id: scraper_runs.id });

    return run.id;
  },

  /**
   * Complete a scraper run record with results.
   */
  async completeRun(
    runId: string,
    result: {
      jobsScraped: number;
      jobsInserted: number;
      jobsSkipped: number;
      durationMs: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    await db
      .update(scraper_runs)
      .set({
        jobs_scraped: result.jobsScraped,
        jobs_inserted: result.jobsInserted,
        jobs_skipped: result.jobsSkipped,
        duration_ms: result.durationMs,
        error_message: result.errorMessage ?? null,
        completed_at: new Date(),
      })
      .where(eq(scraper_runs.id, runId));
  },

  /**
   * Get scraper run history for monitoring.
   */
  async getRecentRuns(limit = 50): Promise<ScraperRun[]> {
    const result = await db
      .select()
      .from(scraper_runs)
      .orderBy(sql`${scraper_runs.created_at} DESC`)
      .limit(limit);

    return result as unknown as ScraperRun[];
  },

  /**
   * Get aggregate stats for a cycle.
   */
  async getCycleStats(cycleNumber: number): Promise<{
    totalJobsScraped: number;
    totalJobsInserted: number;
    sitesWithErrors: number;
  }> {
    const [stats] = await db
      .select({
        totalJobsScraped: sql<number>`COALESCE(SUM(${scraper_runs.jobs_scraped}), 0)`,
        totalJobsInserted: sql<number>`COALESCE(SUM(${scraper_runs.jobs_inserted}), 0)`,
        sitesWithErrors: sql<number>`COUNT(*) FILTER (WHERE ${scraper_runs.error_message} IS NOT NULL)`,
      })
      .from(scraper_runs)
      .where(eq(scraper_runs.cycle_number, cycleNumber));

    return {
      totalJobsScraped: Number(stats.totalJobsScraped),
      totalJobsInserted: Number(stats.totalJobsInserted),
      sitesWithErrors: Number(stats.sitesWithErrors),
    };
  },

  /**
   * Count unique source_urls to track dataset growth.
   */
  async countUniqueJobs(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(sql`${jobs.source_url} IS NOT NULL`);

    return Number(result.count);
  },

  /**
   * Count jobs by source for dataset analytics.
   */
  async countBySource(): Promise<{ source: string; count: number }[]> {
    const result = await db
      .select({
        source: jobs.source,
        count: sql<number>`count(*)`,
      })
      .from(jobs)
      .groupBy(jobs.source)
      .orderBy(sql`count(*) DESC`);

    return result.map((r) => ({
      source: r.source,
      count: Number(r.count),
    }));
  },
};
