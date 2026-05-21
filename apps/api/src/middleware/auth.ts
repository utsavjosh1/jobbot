import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets.js";
import type { UserRole } from "@postly/shared-types";

// ─── JWT Payload ─────────────────────────────────────────────────────────────

/**
 * Shape of the decoded JWT access token.
 * This is NOT a full User — it only contains the claims we sign.
 */
export interface JwtPayload {
  id: string;
  email: string;
  roles: UserRole[];
  iat?: number;
  exp?: number;
}

// Extend Express Request type to include JwtPayload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Middleware to authenticate JWT access token.
 * Populates `req.user` with `JwtPayload` on success.
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({
      success: false,
      error: { message: "Access token required" },
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { message: "Invalid or expired token" },
    });
  }
}
