import { eq, desc, and } from "drizzle-orm";
import { db } from "../index.js";
import { resumes } from "../schema.js";
import type { Resume } from "@postly/shared-types";

export const resumeQueries = {
  /**
   * Create a new resume entry
   */
  async create(userId: string, fileUrl: string): Promise<Resume> {
    const [result] = await db
      .insert(resumes)
      .values({ user_id: userId, file_url: fileUrl })
      .returning();

    return result as unknown as Resume;
  },

  /**
   * Get all resumes for a user (most recent first)
   */
  async findByUserId(userId: string): Promise<Resume[]> {
    const result = await db
      .select()
      .from(resumes)
      .where(eq(resumes.user_id, userId))
      .orderBy(desc(resumes.created_at));

    return result as unknown as Resume[];
  },

  /**
   * Find resume by ID
   */
  async findById(id: string): Promise<Resume | null> {
    const [result] = await db.select().from(resumes).where(eq(resumes.id, id));

    return (result as unknown as Resume) || null;
  },

  /**
   * Find resume by ID scoped to a user
   */
  async findByIdWithUser(id: string, userId: string): Promise<Resume | null> {
    const [result] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.user_id, userId)));

    return (result as unknown as Resume) || null;
  },

  /**
   * Update resume with parsed analysis data and embedding
   */
  async updateAnalysis(
    id: string,
    parsedText: string,
    skills: string[],
    experienceYears: number,
    education: unknown,
    embedding: number[],
  ): Promise<Resume | null> {
    const [result] = await db
      .update(resumes)
      .set({
        parsed_text: parsedText,
        skills,
        experience_years: experienceYears,
        education,
        embedding,
      })
      .where(eq(resumes.id, id))
      .returning();

    return (result as unknown as Resume) || null;
  },

  /**
   * Delete a resume (scoped to owner)
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const [result] = await db
      .delete(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.user_id, userId)))
      .returning({ id: resumes.id });

    return !!result;
  },
};
