import { eq, sql, and, isNull } from "drizzle-orm";
import { db } from "../index.js";
import { employer_profiles } from "../schema.js";
import type {
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
} from "@postly/shared-types";

export const employerProfileQueries = {
  async create(userId: string, input: CreateEmployerProfileInput) {
    const [result] = await db
      .insert(employer_profiles)
      .values({ user_id: userId, ...input })
      .returning();

    return result;
  },

  async findByUserId(userId: string) {
    const [result] = await db
      .select()
      .from(employer_profiles)
      .where(
        and(
          eq(employer_profiles.user_id, userId),
          isNull(employer_profiles.deleted_at),
        ),
      );

    return result ?? null;
  },

  async findById(id: string) {
    const [result] = await db
      .select()
      .from(employer_profiles)
      .where(
        and(eq(employer_profiles.id, id), isNull(employer_profiles.deleted_at)),
      );

    return result ?? null;
  },

  async update(userId: string, input: UpdateEmployerProfileInput) {
    const [result] = await db
      .update(employer_profiles)
      .set({ ...input, updated_at: new Date() })
      .where(eq(employer_profiles.user_id, userId))
      .returning();

    return result ?? null;
  },

  async updateEmbedding(userId: string, embedding: number[]) {
    await db
      .update(employer_profiles)
      .set({ embedding, updated_at: new Date() })
      .where(eq(employer_profiles.user_id, userId));
  },

  async incrementJobCount(userId: string) {
    await db
      .update(employer_profiles)
      .set({
        active_job_count: sql`${employer_profiles.active_job_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(employer_profiles.user_id, userId));
  },

  async decrementJobCount(userId: string) {
    await db
      .update(employer_profiles)
      .set({
        active_job_count: sql`GREATEST(${employer_profiles.active_job_count} - 1, 0)`,
        updated_at: new Date(),
      })
      .where(eq(employer_profiles.user_id, userId));
  },

  async upsert(userId: string, input: CreateEmployerProfileInput) {
    const [result] = await db
      .insert(employer_profiles)
      .values({ user_id: userId, ...input })
      .onConflictDoUpdate({
        target: [employer_profiles.user_id],
        set: { ...input, updated_at: new Date() },
      })
      .returning();

    return result;
  },
};
