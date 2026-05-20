import { redis } from "../lib/redis.js";
import { logger } from "@postly/logger";

export class CacheService {
  private static readonly KEY_PREFIX = "postly:v1";

  static generateKey(entity: string, id: string | number): string {
    return `${this.KEY_PREFIX}:${entity}:${id}`;
  }

  static async getOrSet<T>(key: string, ttlSeconds: number, fetchFunction: () => Promise<T>): Promise<T> {
    try {
      const cachedData = await redis.get(key);
      if (cachedData) return JSON.parse(cachedData) as T;
    } catch (error) {
      logger.warn("Redis GET failed", { key, error: String(error) });
    }

    const freshData = await fetchFunction();

    if (freshData !== undefined && freshData !== null) {
      redis.setex(key, ttlSeconds, JSON.stringify(freshData)).catch((err) => {
        logger.warn("Background Redis SETEX failed", { key, error: String(err) });
      });
    }

    return freshData;
  }

  static async invalidate(key: string): Promise<void> {
    try { await redis.del(key); } catch (error) { logger.warn("Redis DEL failed", { key, error: String(error) }); }
  }

  static async invalidatePattern(pattern: string): Promise<void> {
    try {
      let cursor = "0";
      do {
        const [nextCursor, matchingKeys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
        cursor = nextCursor;
        if (matchingKeys.length > 0) await redis.del(...matchingKeys);
      } while (cursor !== "0");
    } catch (error) {
      logger.warn("Redis pattern invalidation failed", { pattern, error: String(error) });
    }
  }
}
