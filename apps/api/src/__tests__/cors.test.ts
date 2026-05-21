import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";

// Mock dependencies to prevent side effects during app boot
vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
}));
vi.mock("../lib/redis.js", () => ({
  redis: { ping: vi.fn(), disconnect: vi.fn() },
}));

describe("CORS Configuration", () => {
  it("should allow requests with no origin (like cURL or Postman)", async () => {
    const response = await request(app).options("/health");
    // No Origin header is sent
    expect(response.status).toBe(204); // preflight returns 204
  });

  it("should block requests from unauthorized origins", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://malicious-site.com");

    // Express cors middleware returns 500 when it throws Error
    // or just blocks. Let's see how the app is configured.
    // Our cors config throws `new Error("CORS: origin ... not allowed")`
    expect(response.status).toBe(500);
    expect(response.text).toContain("CORS");
  });
});
