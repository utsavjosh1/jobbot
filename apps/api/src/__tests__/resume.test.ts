import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";

vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
}));

vi.mock("../services/resume.service.js", () => ({
  resumeService: {
    getUserResumes: vi.fn().mockResolvedValue([]),
    processResume: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: "test-id" };
    next();
  },
}));

describe("Resume Routes (/api/v1/resumes)", () => {
  it("should get user resumes", async () => {
    const res = await request(app).get("/api/v1/resumes");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("should reject upload without file", async () => {
    const res = await request(app).post("/api/v1/resumes/upload");
    expect(res.status).toBe(400); // Handled by controller explicitly checking for req.file
  });
});
