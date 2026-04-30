// src/middleware/rateLimit.ts
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Simple in-memory rate limiter (file-based friendly)
class RateLimiter {
  private storage: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.storage.entries()) {
      if (now > entry.resetTime) {
        this.storage.delete(key);
      }
    }
  }

  isRateLimited(key: string): {
    limited: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const entry = this.storage.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      this.storage.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return {
        limited: false,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }

    if (entry.count >= this.maxRequests) {
      return { limited: true, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    this.storage.set(key, entry);
    return {
      limited: false,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }
}

// Rate limiters
const authLimiter = new RateLimiter(60 * 1000, env.RATE_LIMIT_AUTH);
const defaultLimiter = new RateLimiter(60 * 1000, env.RATE_LIMIT_DEFAULT);

const getRequestKey = (req: Request, scope?: string) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  let identifier: string;

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    identifier = forwardedFor[0]!;
  } else if (
    typeof forwardedFor === "string" &&
    forwardedFor.trim().length > 0
  ) {
    identifier = forwardedFor.split(",")[0]!.trim();
  } else {
    identifier = req.ip || "unknown";
  }

  return scope ? `${scope}:${identifier}` : identifier;
};

export const authRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const key = getRequestKey(req, `auth:${req.baseUrl}${req.path}`);
  const result = authLimiter.isRateLimited(key);

  res.setHeader("X-RateLimit-Limit", String(env.RATE_LIMIT_AUTH));
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000));

  if (result.limited) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((result.resetTime - Date.now()) / 1000)),
    );
    return res.status(429).json({
      status: "error",
      message: "Too many auth requests, please try again later",
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    });
  }

  next();
};

export const defaultRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Use user ID if authenticated, otherwise IP
  const key = (req as any).user?.user_id || getRequestKey(req);
  const result = defaultLimiter.isRateLimited(key);

  res.setHeader("X-RateLimit-Limit", String(env.RATE_LIMIT_DEFAULT));
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000));

  if (result.limited) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((result.resetTime - Date.now()) / 1000)),
    );
    return res.status(429).json({
      status: "error",
      message: "Too many requests, please try again later",
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    });
  }

  next();
};
