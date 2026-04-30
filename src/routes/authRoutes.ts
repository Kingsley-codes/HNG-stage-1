// src/routes/authRoutes.ts
import { Router, Request, Response, NextFunction } from "express";
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

const methodNotAllowed = (allowedMethod: string) => {
  return (req: Request, res: Response) => {
    res.setHeader("Allow", allowedMethod);
    return res.status(405).json({
      status: "error",
      message: `Method not allowed. Please use ${allowedMethod}.`,
    });
  };
};

const enforcePost = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return methodNotAllowed("POST")(req, res);
  }
  next();
};

// Auth routes with rate limiting
router.get("/github", authRateLimiter, initiateGitHubAuth);
router.get("/github/callback", authRateLimiter, handleGitHubCallback);

router.post("/refresh", authRateLimiter, refreshToken);
router
  .route("/logout")
  .post(enforcePost, authRateLimiter, logout)
  .all(methodNotAllowed("POST"));
router.get("/me", authRateLimiter, whoami);
router.post("/login", authRateLimiter, login);
router.post("/signup", authRateLimiter, signup);

export default router;
