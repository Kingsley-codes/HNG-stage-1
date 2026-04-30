// src/services/tokenService.ts
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./database.js";
import { env } from "../config/env.js";
import { TokenPayload } from "../types/index.js";

export class TokenService {
  private accessSecret: string;
  private refreshSecret: string;
  private accessExpiry: number;
  private refreshExpiry: number;

  constructor() {
    this.accessSecret = env.JWT_ACCESS_SECRET;
    this.refreshSecret = env.JWT_REFRESH_SECRET;
    this.accessExpiry = env.ACCESS_TOKEN_EXPIRY;
    this.refreshExpiry = env.REFRESH_TOKEN_EXPIRY;
  }

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessExpiry,
      jwtid: crypto.randomUUID(),
      subject: payload.user_id,
    });
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(64).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    return { token, hash };
  }

  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.accessSecret) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  async saveRefreshToken(userId: string, tokenHash: string): Promise<void> {
    db.saveRefreshToken(userId, tokenHash, this.refreshExpiry);
  }

  async findValidRefreshToken(
    tokenHash: string,
  ): Promise<{ user_id: string } | null> {
    return db.findValidRefreshToken(tokenHash);
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    db.revokeRefreshToken(tokenHash);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    db.revokeAllUserRefreshTokens(userId);
  }

  async cleanupExpiredTokens(): Promise<void> {
    db.cleanupExpiredTokens();
  }
}
