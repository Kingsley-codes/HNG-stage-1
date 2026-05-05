// src/config/env.ts
import dotenv from "dotenv";
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "4000"),
  MONGODB_URI: process.env.MONGODB_URI || "",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "profile_intelligence_service",

  // GitHub OAuth
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
  GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI,

  // GitHub OAuth - CLI (separate OAuth app)
  GITHUB_CLI_CLIENT_ID: process.env.GITHUB_CLI_CLIENT_ID || "",
  GITHUB_CLI_CLIENT_SECRET: process.env.GITHUB_CLI_CLIENT_SECRET || "",
  GITHUB_CLI_REDIRECT_URI: process.env.GITHUB_CLI_REDIRECT_URI,

  // JWT
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || "access-secret-key-change-me",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "refresh-secret-key-change-me",
  ACCESS_TOKEN_EXPIRY: parseInt(process.env.ACCESS_TOKEN_EXPIRY || "180"), // 3 minutes in seconds
  REFRESH_TOKEN_EXPIRY: parseInt(process.env.REFRESH_TOKEN_EXPIRY || "300"), // 5 minutes in seconds

  // Frontend URLs
  WEB_PORTAL_URL: process.env.WEB_PORTAL_URL || "http://localhost:5173",
  CLI_CALLBACK_PORT: parseInt(process.env.CLI_CALLBACK_PORT || "3001"),

  // Rate Limiting
  RATE_LIMIT_AUTH: parseInt(process.env.RATE_LIMIT_AUTH || "10"),
  RATE_LIMIT_DEFAULT: parseInt(process.env.RATE_LIMIT_DEFAULT || "60"),

  // API Version
  API_VERSION: process.env.API_VERSION || "1.0",
};

// Validate required env vars
const requiredEnvVars = [
  "MONGODB_URI",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
