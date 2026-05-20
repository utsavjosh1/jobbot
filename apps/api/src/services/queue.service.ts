import { Queue } from "bullmq";
import { REDIS_URL } from "../config/secrets.js";
import { db, bot_configs, eq } from "@postly/database";
import { logger } from "@postly/logger";

const BOT_QUEUE_NAME = "bot_notifications";

export class QueueService {
  private botQueue: Queue;

  constructor() {
    this.botQueue = new Queue(BOT_QUEUE_NAME, { connection: { url: REDIS_URL || "redis://localhost:6379" } });
  }

  initDailyCron = async () => {
    await this.botQueue.add("daily_job_dispatch", { trigger: "cron" }, {
      repeat: { pattern: "0 9 * * *" },
      removeOnComplete: true,
      removeOnFail: 5,
    });
    logger.info("Bot daily job dispatch cron initialized", { schedule: "9:00 AM UTC" });
  };

  dispatchAll = async () => {
    const activeConfigs = await db.select().from(bot_configs).where(eq(bot_configs.is_active, true));
    let queued = 0;
    for (const config of activeConfigs) {
      await this.dispatchForPlatform(config.id);
      queued++;
    }
    logger.info("Job alerts queued", { queued, total: activeConfigs.length });
    return queued;
  };

  dispatchForPlatform = async (configId: string) => {
    const [config] = await db.select().from(bot_configs).where(eq(bot_configs.id, configId)).limit(1);
    if (!config) return;

    await this.botQueue.add("send_bot_message", {
      config_id: config.id, platform: config.platform, target_id: config.target_id,
      webhook_url: config.webhook_url, timestamp: new Date().toISOString(),
    }, { removeOnComplete: true, removeOnFail: 3 });

    logger.info("Job dispatched for bot", { platform: config.platform, configId });
  };

  dispatchForGuild = async (guildId: string, channelId: string) => {
    await this.botQueue.add("send_discord_message", {
      guild_id: guildId, channel_id: channelId, type: "test", timestamp: new Date().toISOString(),
    }, { removeOnComplete: true, removeOnFail: 3 });
  };
}

export const queueService = new QueueService();
