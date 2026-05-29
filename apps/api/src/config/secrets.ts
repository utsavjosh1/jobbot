/**
 * Re-exports from the centralized @postly/config package.
 * All env vars are loaded and validated there.
 *
 * Existing imports like `import { JWT_SECRET } from "../config/secrets.js"`
 * continue to work unchanged.
 */
export {
  // Auth / JWT
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,

  // Server
  NODE_ENV,
  API_PORT,
  WEB_URL,

  // Database
  DATABASE_URL,

  // Redis
  REDIS_URL,

  // AI
  OPENAI_API_KEY,
  OPENAI_MODEL,
  VOYAGE_API_KEY,
  VOYAGE_MODEL,

  // Discord
  DISCORD_BOT_TOKEN,

  // Dodo Payments
  DODO_PAYMENTS_API_KEY,
  DODO_PAYMENTS_WEBHOOK_KEY,
  DODO_PAYMENTS_ENVIRONMENT,
  DODO_PAYMENTS_RETURN_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
} from "@postly/config";
