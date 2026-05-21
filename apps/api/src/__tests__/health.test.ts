import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../server.js";
import { pool } from "@postly/database";
import { redis } from "../lib/redis.js";

// Mock external dependencies
vi.mock("@postly/database", () => ({
  pool: {
    query: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: {
    ping: vi.fn(),
    disconnect: vi.fn(),
  },
}));

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 200 OK when both DB and Redis are healthy", async () => {
    // Setup mocks to resolve successfully
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    } as any);
    vi.mocked(redis.ping).mockResolvedValueOnce("PONG");

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "ok",
        checks: {
          db: "ok",
          redis: "ok",
        },
      }),
    );
  });

  it("should return 503 DEGRADED when DB fails", async () => {
    // DB fails, Redis succeeds
    vi.mocked(pool.query).mockRejectedValueOnce(
      new Error("DB Connection Error"),
    );
    vi.mocked(redis.ping).mockResolvedValueOnce("PONG");

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "degraded",
        checks: {
          db: "failed",
          redis: "ok",
        },
      }),
    );
  });

  it("should return 503 DEGRADED when Redis fails", async () => {
    // DB succeeds, Redis fails
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ "?column?": 1 }],
    } as any);
    vi.mocked(redis.ping).mockRejectedValueOnce(
      new Error("Redis Connection Error"),
    );

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "degraded",
        checks: {
          db: "ok",
          redis: "failed",
        },
      }),
    );
  });
});
