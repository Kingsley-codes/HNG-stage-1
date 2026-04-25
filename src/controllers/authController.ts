// src/controllers/authController.ts
import { Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { env } from "../config/env.js";
import { TokenService } from "../services/tokenService.js";
import { UserService } from "../services/userService.js";
import { GitHubService } from "../services/githubService.js";

// Initialize dependencies
const userService = new UserService();
const tokenService = new TokenService();
const githubService = new GitHubService(
  env.GITHUB_CLIENT_ID,
  env.GITHUB_CLIENT_SECRET,
  env.GITHUB_REDIRECT_URI!,
);

const authService = new AuthService(userService, tokenService, githubService);

export const initiateGitHubAuth = async (req: Request, res: Response) => {
  try {
    const { url, state, codeVerifier } = await authService.initiateGitHubAuth();

    // Store PKCE verifier in cookies
    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: "lax",
    });

    res.cookie("code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
      sameSite: "lax",
    });

    res.json({
      status: "success",
      data: { url },
    });
  } catch (error) {
    console.error("Auth initiation error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to initiate authentication",
    });
  }
};

export const handleGitHubCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    const storedState = req.cookies?.oauth_state;
    const codeVerifier = req.cookies?.code_verifier;

    // Validate state
    if (!state || state !== storedState) {
      return res.status(400).json({
        status: "error",
        message: "Invalid state parameter",
      });
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Missing authorization code",
      });
    }

    const authResult = await authService.handleGitHubCallback(
      code,
      state as string,
      codeVerifier,
    );

    // Clear OAuth cookies
    res.clearCookie("oauth_state");
    res.clearCookie("code_verifier");

    // For web portal: set HTTP-only cookies
    if (req.query.client === "web") {
      res.cookie("access_token", authResult.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.ACCESS_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });

      res.cookie("refresh_token", authResult.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.REFRESH_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });

      // Redirect to web portal
      return res.redirect(`${env.WEB_PORTAL_URL}/dashboard`);
    }

    // For CLI: return JSON
    res.json({
      status: "success",
      data: authResult,
    });
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Authentication failed",
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token required",
      });
    }

    const tokens = await authService.refreshTokens(refresh_token);

    // Update cookies if from web
    if (req.cookies?.refresh_token) {
      res.cookie("access_token", tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.ACCESS_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });

      res.cookie("refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.REFRESH_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });
    }

    res.json({
      status: "success",
      data: tokens,
    });
  } catch (error: any) {
    res.status(401).json({
      status: "error",
      message: error.message || "Invalid refresh token",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.body.refresh_token || req.cookies?.refresh_token;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear cookies
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");

    res.json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      status: "error",
      message: "Logout failed",
    });
  }
};

export const whoami = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7);

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Not authenticated",
      });
    }

    const payload = tokenService.verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({
        status: "error",
        message: "Invalid token",
      });
    }

    const user = await authService.getUserFromId(payload.user_id);

    res.json({
      status: "success",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get user info",
    });
  }
};
