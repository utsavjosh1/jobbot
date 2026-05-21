import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import promBundle from "express-prom-bundle";
import path from "path";
import { fileURLToPath } from "url";
import { tokenBucketRateLimiter } from "./middleware/token-bucket-rate-limit.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { pool } from "@postly/database";
import { logger } from "@postly/logger";
import { API_PORT, WEB_URL, NODE_ENV } from "./config/secrets.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { redis as healthRedis } from "./lib/redis.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import jobRoutes from "./routes/job.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import botRoutes from "./routes/bot.routes.js";
import dodoRoutes from "./routes/dodo.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import { queueService } from "./services/queue.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

app.use(requestIdMiddleware);
app.use(compression());

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: { collectDefaultMetrics: {} },
});
app.use(metricsMiddleware);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = WEB_URL
  ? WEB_URL.split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean)
  : [];

if (!allowedOrigins.length) {
  logger.warn("WEB_URL is not set — CORS will block all browser requests");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin))
        return callback(null, true);
      logger.warn("CORS blocked request", { origin });
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  }),
);

const aiRateLimiter = tokenBucketRateLimiter({
  maxTokens: 50,
  refillRateSec: 5,
  keyPrefix: "rl:ai",
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: "Too many requests, please try again later." },
  },
});

const healthRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: "Health check rate limit exceeded." },
  },
});

app.get("/health", healthRateLimiter, async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await pool.query("SELECT 1");
    checks.db = "ok";
  } catch {
    checks.db = "failed";
  }
  try {
    await healthRedis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "failed";
  }
  const allHealthy = checks.db === "ok" && checks.redis === "ok";
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ok" : "degraded",
    checks,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use(apiRateLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (NODE_ENV === "production" || duration > 1000) {
      logger.info("request", {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration_ms: duration,
        user_id:
          (req as unknown as Request & { user?: { id: string } }).user?.id ||
          null,
      });
    }
  });
  next();
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/resumes", aiRateLimiter, resumeRoutes);
app.use("/api/v1/chat", aiRateLimiter, chatRoutes);
app.use("/api/v1/bots", botRoutes);
app.use("/api/v1/payments", dodoRoutes);
app.use("/api/v1/applications", applicationRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(API_PORT, "0.0.0.0", async () => {
  logger.info("API server started", {
    port: API_PORT,
    environment: NODE_ENV,
    url: `http://0.0.0.0:${API_PORT}`,
  });
  try {
    await queueService.initDailyCron();
  } catch (err) {
    logger.error("Failed to initialize Bot Queue", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  healthRedis.disconnect();
  await pool.end();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
