import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets.js";

interface RateLimitConfig {
  maxTokens: number;
  refillRateSec: number;
  keyPrefix?: string;
}

const tokenBucketScript = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refill_rate_per_sec = tonumber(ARGV[2])
  local now_ms = tonumber(ARGV[3])
  local requested = tonumber(ARGV[4])
  local bucket = redis.call("HMGET", key, "tokens", "last_refill")
  local tokens = tonumber(bucket[1])
  local last_refill = tonumber(bucket[2])
  if not tokens then tokens = capacity; last_refill = now_ms
  else
    local time_passed_ms = math.max(0, now_ms - last_refill)
    local accrued = (time_passed_ms / 1000) * refill_rate_per_sec
    tokens = math.min(capacity, tokens + accrued)
  end
  local granted = 0
  if tokens >= requested then tokens = tokens - requested; granted = 1 end
  redis.call("HMSET", key, "tokens", tostring(tokens), "last_refill", tostring(now_ms))
  local ttl = math.ceil(capacity / refill_rate_per_sec) + 1
  redis.call("EXPIRE", key, ttl)
  return { granted, tostring(tokens) }
`;

redis.defineCommand("consumeTokenBucket", {
  numberOfKeys: 1,
  lua: tokenBucketScript,
});

export const tokenBucketRateLimiter = (config: RateLimitConfig) => {
  const { maxTokens, refillRateSec, keyPrefix = "rl:tb" } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (redis.status !== "ready") return next();

      const clientIp = req.ip || "unknown-ip";
      let identifier = clientIp;

      try {
        const token = (req.headers["authorization"] ?? "").slice(7);
        const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
        if (typeof decoded?.id === "string" && decoded.id.length > 0) {
          identifier = `${clientIp}:uid:${decoded.id}`;
        }
      } catch {
        /* IP-only rate limiting */
      }

      const key = `${keyPrefix}:${identifier}`;
      const [grantedResult, currentTokensResult] =
        await // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (redis as any).consumeTokenBucket(
          key,
          maxTokens,
          refillRateSec,
          Date.now(),
          1,
        );

      const granted = grantedResult === 1;
      const currentTokens = parseFloat(currentTokensResult);
      const remaining = Math.max(0, Math.floor(currentTokens));

      let resetMs = Date.now();
      if (!granted && currentTokens < 1) {
        resetMs = Date.now() + ((1 - currentTokens) / refillRateSec) * 1000;
      }

      res.setHeader("X-RateLimit-Limit", maxTokens.toString());
      res.setHeader("X-RateLimit-Remaining", remaining.toString());
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetMs / 1000).toString());

      if (granted) return next();

      return res.status(429).json({
        success: false,
        error: {
          code: "too_many_requests",
          message: "Too many requests. Please try again later.",
          limit: maxTokens,
          remaining,
          reset_at: Math.ceil(resetMs / 1000),
        },
      });
    } catch (err) {
      console.error("Token Bucket Rate Limiter Error:", err);
      if (!res.headersSent) return next();
    }
  };
};
