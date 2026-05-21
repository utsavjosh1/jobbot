import { Redis } from "ioredis";
import { REDIS_URL } from "../config/secrets.js";
import { logger } from "@postly/logger";

export const redis = new Redis(REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
});

redis.on("error", (err) => {
  logger.error("Shared Redis connection error", { error: err.message });
});

export default redis;
