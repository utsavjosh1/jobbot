import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import promBundle from "express-prom-bundle";
import { tokenBucketRateLimiter } from "./middleware/token-bucket-rate-limit.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { pool } from "@postly/database";
import { logger } from "@postly/logger";
import { API_PORT, WEB_URL, NODE_ENV } from "./config/secrets.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import jobRoutes from "./routes/job.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import botRoutes from "./routes/bot.routes.js";
import dodoRoutes from "./routes/dodo.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import { queueService } from "./services/queue.service.js";

const app = express();
app.set("trust proxy", 1);

import { redis as healthRedis } from "./lib/redis.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Request correlation ID — must be first for tracing
app.use(requestIdMiddleware);

// Response compression — critical for high-latency links
app.use(compression());

// Prometheus Metrics Middleware
// Exposes /metrics endpoint for VictoriaMetrics/Prometheus to scrape
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: {
    collectDefaultMetrics: {},
  },
});
app.use(metricsMiddleware);

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const allowedOrigins = WEB_URL
  ? WEB_URL.split(",")
      .map((o) => o.trim().replace(/\/$/, "")) // Remove trailing slash
      .filter(Boolean)
  : [];

if (allowedOrigins.length === 0) {
  logger.warn("WEB_URL is not set — CORS will block all browser requests");
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Normalize incoming origin
      const normalizedOrigin = origin.replace(/\/$/, "");

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      logger.warn("CORS blocked request", { origin });
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400, // Cache preflight for 24h — saves ~300ms per cross-origin request
  }),
);

const aiRateLimiter = tokenBucketRateLimiter({
  maxTokens: 50,
  refillRateSec: 5, // 5 tokens per second refill
  keyPrefix: "rl:ai",
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: "Too many requests, please try again later." },
  },
});

const healthRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: "Health check rate limit exceeded." },
  },
});

// Health check — rate limited to prevent DB/Redis connection exhaustion
app.get("/health", healthRateLimiter, async (_req, res) => {
  const checks: Record<string, string> = {};

  // Check Postgres
  try {
    await pool.query("SELECT 1");
    checks.db = "ok";
  } catch {
    checks.db = "failed";
  }

  // Check Redis
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

// Apply global API rate limit (Standard Window)
app.use(apiRateLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware (structured for production log aggregation)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    // Only log in production or for slow requests
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

// API routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/resumes", aiRateLimiter, resumeRoutes);
app.use("/api/v1/chat", aiRateLimiter, chatRoutes);
app.use("/api/v1/bots", botRoutes);
app.use("/api/v1/payments", dodoRoutes);
app.use("/api/v1/applications", applicationRoutes);

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server only if not in test mode
if (process.env.NODE_ENV !== "test") {
  app.listen(API_PORT, "0.0.0.0", async () => {
    logger.info("API server started", {
      port: API_PORT,
      environment: NODE_ENV,
      url: `http://0.0.0.0:${API_PORT}`,
    });

    // Initialize Bot Job Queue
    try {
      await queueService.initDailyCron();
    } catch (err) {
      logger.error("Failed to initialize Bot Queue", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  });
}

// Graceful shutdown — close all connections before exiting
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  healthRedis.disconnect();
  await pool.end();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
