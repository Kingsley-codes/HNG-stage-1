// src/routes/authRoutes.ts
import { Router } from "express";
import {
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

router.get("/github", authRateLimiter, initiateGitHubAuth);
router.get("/github/callback", authRateLimiter, handleGitHubCallback);

router.post("/refresh", authRateLimiter, refreshToken);
router.post("/logout", authRateLimiter, logout);
router.get("/me", authRateLimiter, whoami);
router.post("/login", authRateLimiter, login);
router.post("/signup", authRateLimiter, signup);

export default router;
