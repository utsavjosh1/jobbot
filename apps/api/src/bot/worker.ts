import { Worker, type Job } from "bullmq";
import { Client, TextChannel } from "discord.js";
import { db, bot_configs, jobs, eq, and, desc } from "@postly/database";
import { logger } from "@postly/logger";
import { REDIS_URL } from "../config/secrets.js";
import { buildJobEmbed } from "./embeds.js";
import type { JobRow } from "./embeds.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = "bot_notifications";
const MAX_JOBS_PER_DISPATCH = 5;

// ── Connection reused across the worker lifetime ────────────────────────────
const connection = { url: REDIS_URL || "redis://localhost:6379" };

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

interface DailyDispatchData {
  trigger: "cron";
}

interface DiscordMessageData {
  guild_id: string;
  channel_id: string;
  type?: string;
  timestamp?: string;
}

interface BotMessageData {
  config_id: string;
  platform: string;
  target_id?: string;
  webhook_url?: string;
  timestamp?: string;
}

type BotJobData = DailyDispatchData | DiscordMessageData | BotMessageData;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the top N active jobs, newest first.  Single query, O(1) in code.
 */
async function fetchLatestJobs(
  limit = MAX_JOBS_PER_DISPATCH,
): Promise<JobRow[]> {
  return (await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company_name: jobs.company_name,
      description: jobs.description,
      location: jobs.location,
      salary_min: jobs.salary_min,
      salary_max: jobs.salary_max,
      job_type: jobs.job_type,
      remote: jobs.remote,
      source_url: jobs.source_url,
    })
    .from(jobs)
    .where(eq(jobs.is_active, true))
    .orderBy(desc(jobs.posted_at))
    .limit(limit)) as unknown as JobRow[];
}

/**
 * Resolve a Discord TextChannel. Uses cache (O(1)) then fetch fallback.
 */
async function resolveChannel(
  client: Client,
  channelId: string,
): Promise<TextChannel | null> {
  const cached = client.channels.cache.get(channelId);
  if (cached && cached instanceof TextChannel) return cached;

  try {
    const fetched = await client.channels.fetch(channelId);
    return fetched instanceof TextChannel ? fetched : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dispatch logic
// ---------------------------------------------------------------------------

/**
 * Fetch latest jobs and send them to a specific guild+channel.
 * Handles Discord permission errors gracefully.
 */
export async function processGuildDispatch(
  guildId: string,
  channelId: string,
  client: Client,
): Promise<void> {
  const channel = await resolveChannel(client, channelId);
  if (!channel) {
    logger.warn("Channel not found for dispatch", { guildId, channelId });
    return;
  }

  const jobs = await fetchLatestJobs();
  if (jobs.length === 0) {
    logger.info("No active jobs to dispatch", { guildId });
    return;
  }

  logger.info("Dispatching jobs to guild", {
    guildId,
    channel: channel.name,
    jobCount: jobs.length,
  });

  let sent = 0;
  for (const job of jobs) {
    try {
      const embed = buildJobEmbed(job);
      await channel.send({ embeds: [embed] });
      sent++;
      // Respect Discord rate limits (5/5s per channel)
      await new Promise((r) => setTimeout(r, 1_200));
    } catch (err) {
      const msg = (err as Error).message;
      logger.error("Failed to send job embed", { jobId: job.id, error: msg });

      // If forbidden or not found, stop & mark inactive
      if (msg.includes("Missing Access") || msg.includes("Unknown Channel")) {
        await db
          .update(bot_configs)
          .set({ is_active: false, last_error: msg, updated_at: new Date() })
          .where(
            and(
              eq(bot_configs.platform, "discord"),
              eq(bot_configs.target_id, guildId),
            ),
          );
        return;
      }
    }
  }

  logger.info("Dispatch complete", { guildId, sent, total: jobs.length });
}

/**
 * Handle the daily cron trigger: dispatch to ALL active Discord guilds.
 */
async function handleDailyDispatch(client: Client): Promise<void> {
  const configs = await db
    .select({
      guildId: bot_configs.target_id,
      channelId: bot_configs.platform_config,
    })
    .from(bot_configs)
    .where(
      and(eq(bot_configs.platform, "discord"), eq(bot_configs.is_active, true)),
    );

  logger.info("Daily dispatch: processing guilds", { count: configs.length });

  for (const row of configs) {
    const chId =
      typeof row.channelId === "object" && row.channelId !== null
        ? (row.channelId as Record<string, unknown>).channel_id
        : null;
    if (!row.guildId || !chId) continue;

    await processGuildDispatch(row.guildId, String(chId), client);
    // Pace between guilds to avoid exhausting the rate limit
    await new Promise((r) => setTimeout(r, 3_000));
  }

  logger.info("Daily dispatch complete", { guilds: configs.length });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function createBotWorker(client: Client): Worker<BotJobData> {
  const worker = new Worker<BotJobData>(
    QUEUE_NAME,
    async (job: Job<BotJobData>) => {
      const { name, data } = job;

      switch (name) {
        // ── Cron-triggered daily dispatch to all guilds ──────────────────
        case "daily_job_dispatch": {
          logger.info("Processing daily_job_dispatch");
          await handleDailyDispatch(client);
          break;
        }

        // ── Single-guild Discord dispatch ───────────────────────────────
        case "send_discord_message": {
          const d = data as DiscordMessageData;
          if (!d.guild_id || !d.channel_id) {
            logger.error("Invalid send_discord_message data", { data: d });
            return;
          }
          await processGuildDispatch(d.guild_id, d.channel_id, client);
          break;
        }

        // ── Generic bot message (webhook, future platforms) ─────────────
        case "send_bot_message": {
          const d = data as BotMessageData;
          logger.info("Processing send_bot_message", {
            platform: d.platform,
            configId: d.config_id,
          });

          if (d.platform === "discord") {
            // Look up the channel from bot_configs
            const [config] = await db
              .select({
                guildId: bot_configs.target_id,
                channelId: bot_configs.platform_config,
              })
              .from(bot_configs)
              .where(eq(bot_configs.id, d.config_id))
              .limit(1);

            if (config) {
              const chId =
                typeof config.channelId === "object" &&
                config.channelId !== null
                  ? (config.channelId as Record<string, unknown>).channel_id
                  : null;
              if (config.guildId && chId) {
                await processGuildDispatch(
                  config.guildId,
                  String(chId),
                  client,
                );
              }
            }
          }
          // Future: reddit, twitter dispatch paths
          break;
        }

        default:
          logger.warn("Unknown job type", { name });
      }
    },
    {
      connection,
      concurrency: 3,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("completed", (job) => {
    logger.info("Job completed", { name: job.name, id: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.error("Job failed", {
      name: job?.name,
      id: job?.id,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error("Worker error", { error: err.message });
  });

  return worker;
}
