import { eq, sql, and, isNull } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { db } from "../index.js";
import { seeker_profiles } from "../schema.js";
import type { SeekerProfileData } from "@postly/shared-types";

export const seekerProfileQueries = {
  async upsertFromResume(
    userId: string,
    data: SeekerProfileData,
    embedding?: number[],
  ) {
    const values = {
      user_id: userId,
      ...data,
      ...(embedding && { embedding }),
      last_parsed_at: new Date(),
    };

    const [result] = await db
      .insert(seeker_profiles)
      .values(values)
      .onConflictDoUpdate({
        target: [seeker_profiles.user_id],
        set: {
          ...data,
          ...(embedding && { embedding }),
          updated_at: new Date(),
          last_parsed_at: new Date(),
        },
      })
      .returning();

    return result;
  },

  async findByUserId(userId: string) {
    const [result] = await db
      .select()
      .from(seeker_profiles)
      .where(
        and(
          eq(seeker_profiles.user_id, userId),
          isNull(seeker_profiles.deleted_at),
        ),
      );

    return result ?? null;
  },

  async update(userId: string, data: SeekerProfileData) {
    const [result] = await db
      .update(seeker_profiles)
      .set({ ...data, updated_at: new Date() })
      .where(eq(seeker_profiles.user_id, userId))
      .returning();

    return result ?? null;
  },

  async updateEmbedding(userId: string, embedding: number[]) {
    await db
      .update(seeker_profiles)
      .set({ embedding, updated_at: new Date() })
      .where(eq(seeker_profiles.user_id, userId));
  },

  async updatePromptHistorySummary(userId: string, summary: string) {
    await db
      .update(seeker_profiles)
      .set({ prompt_history_summary: summary, updated_at: new Date() })
      .where(eq(seeker_profiles.user_id, userId));
  },

  // Vector ANN search across all seeker profiles (for email alert fan-out).
  async vectorSearch(queryEmbedding: number[], limit = 50) {
    const similarity = sql<number>`1 - (${seeker_profiles.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;

    return db
      .select({ ...getTableColumns(seeker_profiles), similarity })
      .from(seeker_profiles)
      .where(and(sql`${seeker_profiles.embedding} IS NOT NULL`))
      .orderBy(
        sql`${seeker_profiles.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`,
      )
      .limit(limit);
  },
};
