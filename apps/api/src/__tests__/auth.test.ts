import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../server.js";
import { AuthService } from "../services/auth.service.js";
import { AuthError } from "../services/auth.service.js";

// Mock dependencies to prevent side effects
vi.mock("@postly/database", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
}));
vi.mock("../lib/redis.js", () => ({
  redis: { ping: vi.fn(), disconnect: vi.fn() },
}));

// Mock AuthService
vi.mock("../services/auth.service.js", () => {
  return {
    AuthService: vi.fn().mockImplementation(() => ({
      register: vi.fn(),
      login: vi.fn(),
    })),
    AuthError: class AuthError extends Error {
      statusCode: number;
      code?: string;
      constructor(message: string, statusCode: number = 400, code?: string) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "AuthError";
      }
    },
  };
});

describe("Auth Routes (/api/v1/auth)", () => {
  let authServiceMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Get instance of the mocked service
    authServiceMock = new AuthService();
  });

  describe("POST /register", () => {
    it("should return 400 for invalid email", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "invalid-email", password: "password123" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: { message: "Invalid email address" },
      });
    });

    it("should return 400 for short password", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "short" });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        "Password must be at least 8 characters",
      );
    });

    it("should register successfully with valid data", async () => {
      // Setup mock
      authServiceMock.register.mockResolvedValueOnce({
        user: { id: "1", email: "test@example.com" },
        access_token: "mock_token",
      });

      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "securepassword123" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("access_token");
    });

    it("should handle AuthError correctly", async () => {
      authServiceMock.register.mockRejectedValueOnce(
        new AuthError("Email already in use", 409, "EMAIL_EXISTS"),
      );

      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "securepassword123" });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: { message: "Email already in use", code: "EMAIL_EXISTS" },
      });
    });
  });

  describe("POST /login", () => {
    it("should return 400 for missing credentials", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({});
      expect(response.status).toBe(400);
    });

    it("should login successfully", async () => {
      authServiceMock.login.mockResolvedValueOnce({
        user: { id: "1", email: "test@example.com" },
        access_token: "mock_token",
      });

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@example.com", password: "securepassword123" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 401 for invalid credentials", async () => {
      authServiceMock.login.mockRejectedValueOnce(
        new AuthError("Invalid email or password", 401, "INVALID_CREDENTIALS"),
      );

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@example.com", password: "wrongpassword" });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe("Invalid email or password");
    });
  });
});
