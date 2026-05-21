import { generateText, generateVoyageEmbedding } from "@postly/ai-utils";
import { resumeQueries, jobQueries, pool } from "@postly/database";
import type {
  Job,
  JobMatch,
  Resume,
  EducationEntry,
} from "@postly/shared-types";
import { logger } from "@postly/logger";

interface MatchedJob extends Job {
  match_score: number;
  ai_explanation?: string;
}

export class MatchingService {
  private getEmbeddingVector(embedding: number[] | string): number[] {
    return typeof embedding === "string" ? JSON.parse(embedding) : embedding;
  }

  async findMatchingJobs(
    resumeId: string,
    userId: string,
    limit = 20,
  ): Promise<MatchedJob[]> {
    const resume = await resumeQueries.findByIdWithUser(resumeId, userId);
    if (!resume) throw new Error("Resume not found");

    let embedding: number[];
    if (resume.embedding) {
      embedding = this.getEmbeddingVector(resume.embedding);
    } else if (resume.parsed_text) {
      const text = `Skills: ${resume.skills?.join(", ") || "Not specified"}. Experience: ${resume.experience_years || 0} years. ${resume.parsed_text.substring(0, 1000)}`;
      embedding = (await generateVoyageEmbedding(text)).embedding;
    } else {
      throw new Error("Resume has no content to match against");
    }

    const matchedJobs = await jobQueries.findMatchingByEmbedding(
      embedding,
      limit,
    );
    return matchedJobs.map((job: Job & { similarity: number }) => ({
      ...job,
      match_score: Math.round(job.similarity * 100),
    }));
  }

  async getMatchesWithExplanations(
    resumeId: string,
    userId: string,
    limit = 10,
  ): Promise<MatchedJob[]> {
    const [matches, resume] = await Promise.all([
      this.findMatchingJobs(resumeId, userId, limit),
      resumeQueries.findByIdWithUser(resumeId, userId),
    ]);
    if (!resume) return matches;

    const top = matches.slice(0, 5);
    const explained = await Promise.all(
      top.map(async (job) => {
        try {
          const explanation = await this.generateMatchExplanation(resume, job);
          return { ...job, ai_explanation: explanation };
        } catch (error) {
          logger.error("Failed to generate match explanation", {
            jobId: job.id,
            error: String(error),
          });
          return job;
        }
      }),
    );
    return [...explained, ...matches.slice(5)];
  }

  private async generateMatchExplanation(
    resume: Resume,
    job: Job,
  ): Promise<string> {
    const prompt = `You are a career advisor. Briefly explain (2-3 sentences) why this job might be a good match for the candidate.

Candidate Profile:
- Skills: ${resume.skills?.join(", ") || "Not specified"}
- Experience: ${resume.experience_years || 0} years
- Education: ${resume.education?.map((e: EducationEntry) => `${e.degree} from ${e.institution}`).join(", ") || "Not specified"}

Job:
- Title: ${job.title}
- Company: ${job.company_name}
- Required Skills: ${job.skills_required?.join(", ") || "Not specified"}
- Experience Required: ${job.experience_required || "Not specified"}

Keep your response concise and actionable.`;

    const { text: explanation } = await generateText(prompt);
    return explanation.trim();
  }

  async saveMatch(
    userId: string,
    resumeId: string,
    jobId: string,
    matchScore: number,
    explanation?: string,
  ): Promise<JobMatch> {
    const result = await pool.query<JobMatch>(
      `INSERT INTO job_matches (user_id, resume_id, job_id, match_score, ai_explanation, is_saved)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (user_id, job_id) DO UPDATE SET is_saved = true, match_score = $4
       RETURNING *`,
      [userId, resumeId, jobId, matchScore, explanation],
    );
    return result.rows[0];
  }

  async getSavedMatches(userId: string): Promise<(JobMatch & { job: Job })[]> {
    const result = await pool.query<JobMatch & { job: Job }>(
      `SELECT jm.*, row_to_json(j.*) as job
       FROM job_matches jm JOIN jobs j ON j.id = jm.job_id
       WHERE jm.user_id = $1 AND jm.is_saved = true
       ORDER BY jm.match_score DESC`,
      [userId],
    );
    return result.rows;
  }

  async unsaveMatch(userId: string, jobId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE job_matches SET is_saved = false WHERE user_id = $1 AND job_id = $2`,
      [userId, jobId],
    );
    return !!result.rowCount;
  }

  async markAsApplied(userId: string, jobId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE job_matches SET applied = true WHERE user_id = $1 AND job_id = $2`,
      [userId, jobId],
    );
    return !!result.rowCount;
  }
}

export const matchingService = new MatchingService();
