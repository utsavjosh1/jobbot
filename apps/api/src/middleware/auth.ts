import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets.js";
import type { UserRole } from "@postly/shared-types";

export interface JwtPayload {
  id: string;
  email: string;
  roles: UserRole[];
  iat?: number;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) {
    res
      .status(401)
      .json({ success: false, error: { message: "Access token required" } });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    next();
  } catch {
    res
      .status(401)
      .json({ success: false, error: { message: "Invalid or expired token" } });
  }
}
