// src/middleware/csrf.ts
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// Generate CSRF token
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Middleware to verify CSRF token for non-GET requests
export function verifyCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Skip CSRF for API endpoints that use Bearer token
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return next();
  }

  // For session/cookie-based requests (web portal)
  const csrfToken = req.headers["x-csrf-token"] || req.body._csrf;
  const sessionToken = req.cookies?.csrf_token;

  if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
    return res.status(403).json({
      status: "error",
      message: "Invalid CSRF token",
    });
  }

  next();
}

// Middleware to set CSRF token in response headers
export function setCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.csrf_token) {
    const token = generateCsrfToken();
    res.cookie("csrf_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.setHeader("X-CSRF-Token", token);
  } else {
    res.setHeader("X-CSRF-Token", req.cookies.csrf_token);
  }
  next();
}
