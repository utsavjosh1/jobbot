import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";
import { jobQueries } from "@postly/database";

vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  jobQueries: { findActive: vi.fn(), countActive: vi.fn(), findById: vi.fn() },
}));

vi.mock("../middleware/auth.js", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: "test-id" };
    next();
  },
}));

describe("Job Routes (/api/v1/jobs)", () => {
  it("should list active jobs", async () => {
    vi.mocked(jobQueries.findActive).mockResolvedValueOnce([
      { id: "job-1" },
    ] as any);
    vi.mocked(jobQueries.countActive).mockResolvedValueOnce(1);
    const res = await request(app).get("/api/v1/jobs?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
  });

  it("should return 404 for missing job", async () => {
    vi.mocked(jobQueries.findById).mockResolvedValueOnce(undefined as any);
    const res = await request(app).get("/api/v1/jobs/non-existent");
    expect(res.status).toBe(404);
  });
});
