// src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { TokenService } from "../services/tokenService.js";

const tokenService = new TokenService();

export interface AuthRequest extends Request {
  user?: {
    user_id: string;
    username: string;
    role: string;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;
    const cookieToken = req.cookies?.access_token;
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "No token provided",
      });
    }

    const payload = tokenService.verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({
        status: "error",
        message: "Invalid or expired token",
      });
    }

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      status: "error",
      message: "Authentication failed",
    });
  }
}
