import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";

vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  conversationQueries: { findByUser: vi.fn(), create: vi.fn() },
}));

vi.mock("../middleware/auth.js", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: "test-id" };
    next();
  },
}));

describe("Chat Routes (/api/v1/chat)", () => {
  it("should get conversations", async () => {
    const res = await request(app).get("/api/v1/chat/conversations");
    expect(res.status).toBe(200);
  });

  it("should validate stream request", async () => {
    const res = await request(app).post("/api/v1/chat/stream").send({});
    expect(res.status).toBe(400); // Missing required fields
  });
});
