import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../index.js";
import { job_matches, jobs } from "../schema.js";
import type { JobMatch, Job } from "@postly/shared-types";

export const matchQueries = {
  async create(
    userId: string,
    resumeId: string,
    jobId: string,
    matchScore: number,
    aiExplanation: string,
  ): Promise<JobMatch> {
    const [result] = await db
      .insert(job_matches)
      .values({
        user_id: userId,
        resume_id: resumeId,
        job_id: jobId,
        match_score: matchScore.toString(),
        ai_explanation: aiExplanation,
        is_saved: false,
      })
      .onConflictDoUpdate({
        target: [job_matches.user_id, job_matches.job_id],
        set: {
          match_score: matchScore.toString(),
          ai_explanation: aiExplanation,
          created_at: new Date(),
        },
      })
      .returning();

    return result as unknown as JobMatch;
  },

  async findByUser(userId: string, limit = 20): Promise<JobMatch[]> {
    const results = await db
      .select({
        match: job_matches,
        job: {
          title: jobs.title,
          company_name: jobs.company_name,
          location: jobs.location,
          remote: jobs.remote,
        },
      })
      .from(job_matches)
      .innerJoin(jobs, eq(job_matches.job_id, jobs.id))
      .where(
        and(eq(job_matches.user_id, userId), isNull(job_matches.deleted_at)),
      )
      .orderBy(desc(job_matches.match_score), desc(job_matches.created_at))
      .limit(limit);

    return results.map(({ match, job }) => ({
      ...match,
      job: job as unknown as Job,
    })) as unknown as JobMatch[];
  },

  async findSavedByUser(userId: string, limit = 50): Promise<JobMatch[]> {
    const results = await db
      .select({
        match: job_matches,
        job: {
          title: jobs.title,
          company_name: jobs.company_name,
          location: jobs.location,
          remote: jobs.remote,
          source_url: jobs.source_url,
        },
      })
      .from(job_matches)
      .innerJoin(jobs, eq(job_matches.job_id, jobs.id))
      .where(
        and(
          eq(job_matches.user_id, userId),
          eq(job_matches.is_saved, true),
          isNull(job_matches.deleted_at),
        ),
      )
      .orderBy(desc(job_matches.created_at))
      .limit(limit);

    return results.map(({ match, job }) => ({
      ...match,
      job: job as unknown as Job,
    })) as unknown as JobMatch[];
  },

  async findByJobId(userId: string, jobId: string): Promise<JobMatch | null> {
    const [result] = await db
      .select()
      .from(job_matches)
      .where(
        and(eq(job_matches.user_id, userId), eq(job_matches.job_id, jobId)),
      );

    return (result as unknown as JobMatch) || null;
  },

  async markSaved(matchId: string, isSaved: boolean): Promise<void> {
    await db
      .update(job_matches)
      .set({ is_saved: isSaved })
      .where(eq(job_matches.id, matchId));
  },

  async markApplied(matchId: string): Promise<void> {
    await db
      .update(job_matches)
      .set({ applied: true })
      .where(eq(job_matches.id, matchId));
  },
};
