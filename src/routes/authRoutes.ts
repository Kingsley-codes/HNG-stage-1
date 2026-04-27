// src/routes/authRoutes.ts
import { Router } from "express";
import {
  getCLIAuthUrl,
  handleGitHubCallback,
  initiateGitHubAuth,
  login,
  logout,
  refreshToken,
  signup,
  whoami,
} from "../controllers/authController.js";
import { authRateLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Auth routes with rate limiting

// Web OAuth flow (browser-based)
router.get("/github", authRateLimiter, initiateGitHubAuth);
router.get("/github/callback", authRateLimiter, handleGitHubCallback);

// CLI OAuth flow (explicit endpoints for CLI)
router.post("/cli/github/url", authRateLimiter, getCLIAuthUrl);
router.post("/cli/github/callback", authRateLimiter, handleGitHubCallback);

router.post("/refresh", authRateLimiter, refreshToken);
router.post("/logout", authRateLimiter, logout);
router.get("/me", authRateLimiter, whoami);
router.post("/login", authRateLimiter, login);
router.post("/signup", authRateLimiter, signup);

export default router;
