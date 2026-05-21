import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { JwtPayload } from "../middleware/auth.js";
import { AuthService, AuthError } from "../services/auth.service.js";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(1, "Full name is required").optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Refresh token is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "OTP must be 6 digits"),
});

const resendOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ─── Error Helper ────────────────────────────────────────────────────────────

function handleServiceError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AuthError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        message: error.message,
        ...(error.code && { code: error.code }),
      },
    });
    return;
  }
  next(error);
}

// ─── Controller ──────────────────────────────────────────────────────────────
// Thin HTTP adapter: validates input → calls service → sends response.
// All business logic lives in AuthService.

export class AuthController {
  private authService = new AuthService();

  // ─── POST /register ──────────────────────────────────────────────────────

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const { email, password, full_name } = validation.data;
      const result = await this.authService.register(
        email,
        password,
        full_name,
      );

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /login ─────────────────────────────────────────────────────────

  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const { email, password } = validation.data;
      const response = await this.authService.login(email, password);

      res.json({ success: true, data: response });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /refresh ───────────────────────────────────────────────────────

  refresh = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = refreshSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const result = await this.authService.refreshAccessToken(
        validation.data.refresh_token,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── GET /me ─────────────────────────────────────────────────────────────

  me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const payload = req.user as JwtPayload;
      const user = await this.authService.getCurrentUser(payload.id);

      res.json({ success: true, data: user });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /forgot-password ───────────────────────────────────────────────

  forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = forgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const result = await this.authService.forgotPassword(
        validation.data.email,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /reset-password ────────────────────────────────────────────────

  resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const result = await this.authService.resetPassword(
        validation.data.token,
        validation.data.password,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /verify-otp ────────────────────────────────────────────────────

  verifyOtp = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = verifyOtpSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const result = await this.authService.verifyOtp(
        validation.data.email,
        validation.data.code,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

  // ─── POST /resend-otp ────────────────────────────────────────────────────

  resendOtp = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validation = resendOtpSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { message: validation.error.issues[0].message },
        });
        return;
      }

      const result = await this.authService.resendOtp(validation.data.email);

      res.json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };
}
