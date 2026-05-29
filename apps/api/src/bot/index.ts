/**
 * Postly Discord Bot – Entry Point
 *
 * Starts the Discord client and the BullMQ worker in a single long-lived
 * process. Designed to run as a separate container from the API server.
 *
 * Usage:  node dist/bot/index.js
 */

import { logger } from "@postly/logger";
import { startDiscordBot } from "./discord-client.js";
import { createBotWorker } from "./worker.js";

async function main(): Promise<void> {
  logger.info("Starting Postly Discord Bot...");

  // 1. Login to Discord (WebSocket connection)
  const client = await startDiscordBot();

  // 2. Attach BullMQ worker (consumes bot_notifications queue)
  const worker = createBotWorker(client);
  logger.info("BullMQ worker attached to queue: bot_notifications");

  // 3. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down bot...`);
    await worker.close();
    client.destroy();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("Bot is running");
}

main().catch((err) => {
  logger.error("Bot failed to start", { error: (err as Error).message });
  process.exit(1);
});
