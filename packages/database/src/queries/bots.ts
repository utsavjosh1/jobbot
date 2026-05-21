import { eq, and, desc } from "drizzle-orm";
import { db } from "../index.js";
import { bot_configs, bot_posts } from "../schema.js";
import type { BotPlatform } from "@postly/shared-types";

export interface CreateBotConfigInput {
  user_id: string;
  platform: BotPlatform;
  target_id?: string;
  target_name?: string;
  webhook_url?: string;
  credentials?: Record<string, unknown>;
  filter_keywords?: string;
  filter_locations?: string;
  filter_min_salary?: string;
  filter_job_types?: string[];
}

export const botQueries = {
  /**
   * Create or update bot configuration for a platform
   */
  async upsertConfig(input: CreateBotConfigInput) {
    const [result] = await db
      .insert(bot_configs)
      .values({
        ...input,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [bot_configs.user_id, bot_configs.platform],
        set: {
          ...input,
          updated_at: new Date(),
        },
      })
      .returning();

    return result;
  },

  /**
   * Find bot config for a user and platform
   */
  async findConfig(userId: string, platform: BotPlatform) {
    const [result] = await db
      .select()
      .from(bot_configs)
      .where(
        and(
          eq(bot_configs.user_id, userId),
          eq(bot_configs.platform, platform),
        ),
      );

    return result ?? null;
  },

  /**
   * Get all active bot configs for a platform (for the worker)
   */
  async findActiveConfigsByPlatform(platform: BotPlatform) {
    return db
      .select()
      .from(bot_configs)
      .where(
        and(
          eq(bot_configs.platform, platform),
          eq(bot_configs.is_active, true),
        ),
      );
  },

  /**
   * Create a record of a job posted by a bot
   */
  async createPost(
    botConfigId: string,
    jobId: string,
    externalPostId?: string,
  ) {
    const [result] = await db
      .insert(bot_posts)
      .values({
        bot_config_id: botConfigId,
        job_id: jobId,
        external_post_id: externalPostId,
        status: "sent",
      })
      .returning();

    // Update last post timestamp
    await db
      .update(bot_configs)
      .set({ last_post_at: new Date() })
      .where(eq(bot_configs.id, botConfigId));

    return result;
  },

  /**
   * Log a failed post attempt
   */
  async logPostError(botConfigId: string, jobId: string, errorMessage: string) {
    return db
      .insert(bot_posts)
      .values({
        bot_config_id: botConfigId,
        job_id: jobId,
        status: "failed",
        error_message: errorMessage,
      })
      .returning();
  },

  /**
   * Get recent posts for a bot config
   */
  async findRecentPosts(botConfigId: string, limit = 50) {
    return db
      .select()
      .from(bot_posts)
      .where(eq(bot_posts.bot_config_id, botConfigId))
      .orderBy(desc(bot_posts.posted_at))
      .limit(limit);
  },
};
