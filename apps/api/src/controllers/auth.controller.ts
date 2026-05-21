import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { JwtPayload } from "../middleware/auth.js";
import { AuthService, AuthError } from "../services/auth.service.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).optional(),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refreshSchema = z.object({ refresh_token: z.string().min(1) });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});
const resendOtpSchema = z.object({ email: z.string().email() });

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

export class AuthController {
  private authService = new AuthService();

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
      const result = await this.authService.register(
        validation.data.email,
        validation.data.password,
        validation.data.full_name,
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

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
      const response = await this.authService.login(
        validation.data.email,
        validation.data.password,
      );
      res.json({ success: true, data: response });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

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

  me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = await this.authService.getCurrentUser(
        (req.user as JwtPayload).id,
      );
      res.json({ success: true, data: user });
    } catch (error) {
      handleServiceError(error, res, next);
    }
  };

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
