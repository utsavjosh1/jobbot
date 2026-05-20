import type { Request, Response, NextFunction } from "express";
import { NODE_ENV, WEB_URL } from "../config/secrets.js";
import { logger } from "@postly/logger";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  if (NODE_ENV !== "production") {
    logger.error("Unhandled error", { message: err.message, stack: err.stack, statusCode });
  }

  if (typeof req.headers.origin === "string" && req.headers.origin.length > 0) {
    const allowedOrigins = WEB_URL ? WEB_URL.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean) : [];
    const matchedOrigin = allowedOrigins.find((o) => o === req.headers.origin!.trim().replace(/\/$/, ""));
    if (matchedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", matchedOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  res.status(statusCode).json({
    success: false,
    error: { message, ...(NODE_ENV !== "production" && { stack: err.stack }) },
  });
}

export function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}
