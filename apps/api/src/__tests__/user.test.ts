import { Request, Response, NextFunction } from "express";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../server.js";
import { userQueries } from "@postly/database";

vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  userQueries: { findById: vi.fn(), update: vi.fn() },
  seekerProfileQueries: { findByUserId: vi.fn() },
}));

vi.mock("../services/cache.service.js", () => ({
  CacheService: {
    generateKey: vi.fn(),
    getOrSet: vi.fn((_key, _ttl, fetcher) => fetcher()),
    invalidate: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: "test-id", email: "test@example.com" };
    next();
  },
}));

describe("User Routes (/api/v1/users)", () => {
  describe("GET /profile", () => {
    it("should return user profile", async () => {
      vi.mocked(userQueries.findById).mockResolvedValueOnce({
        id: "test-id",
        email: "test@example.com",
      } as any);
      const res = await request(app).get("/api/v1/users/profile");
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe("test@example.com");
    });
  });

  describe("PATCH /profile", () => {
    it("should reject invalid avatar URLs", async () => {
      const res = await request(app)
        .patch("/api/v1/users/profile")
        .send({ avatar_url: "not-a-url" });
      expect(res.status).toBe(400);
    });

    it("should update profile", async () => {
      vi.mocked(userQueries.update).mockResolvedValueOnce({
        id: "test-id",
      } as any);
      const res = await request(app)
        .patch("/api/v1/users/profile")
        .send({ full_name: "Test Name" });
      expect(res.status).toBe(200);
    });
  });
});
