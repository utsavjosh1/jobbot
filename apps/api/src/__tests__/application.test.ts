import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";
import { applicationQueries } from "@postly/database";

vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  applicationQueries: { findBySeeker: vi.fn(), create: vi.fn() },
}));

vi.mock("../middleware/auth.js", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: "test-id" };
    next();
  },
}));

describe("Application Routes (/api/v1/applications)", () => {
  it("should get my applications", async () => {
    vi.mocked(applicationQueries.findBySeeker).mockResolvedValueOnce([] as any);
    const res = await request(app).get("/api/v1/applications");
    expect(res.status).toBe(200);
  });

  it("should reject apply without job_id", async () => {
    const res = await request(app).post("/api/v1/applications").send({});
    expect(res.status).toBe(400);
  });
});
