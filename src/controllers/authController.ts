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

// Modified: Accept code_challenge from query parameters
export const initiateGitHubAuth = async (req: Request, res: Response) => {
  try {
    const { code_challenge } = req.query;

    // Validate code_challenge is provided
    if (!code_challenge || typeof code_challenge !== "string") {
      return res.status(400).json({
        status: "error",
        message: "code_challenge parameter is required",
      });
    }

    // Validate code_challenge format (base64url)
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;
    if (!base64urlRegex.test(code_challenge)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid code_challenge format",
      });
    }

    const { url, state } = await authService.initiateGitHubAuth(code_challenge);

    // Store only the state for validation (no code_verifier anymore)
    // This is now stateless - we just need to validate state on callback
    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: "lax",
    });

    res.json({
      status: "success",
      data: {
        url,
        state,
      },
    });
  } catch (error) {
    console.error("Auth initiation error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to initiate authentication",
    });
  }
};

// Modified: Accept code_verifier from request body
export const handleGitHubCallback = async (req: Request, res: Response) => {
  try {
    // Handle both GET (query) and POST (body) parameters
    const code = req.body.code || req.query.code;
    const state = req.body.state || req.query.state;
    const code_verifier = req.body.code_verifier || req.query.code_verifier;
    const clientType = req.body.client || req.query.client;

    // Validate required parameters
    if (!code || !state || !code_verifier || !clientType) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: code, state, code_verifier, and client are required",
      });
    }

    // Validate state matches stored cookie (for web) or passed state (for CLI)
    const storedState = req.cookies?.oauth_state;

    // For CLI, we don't have cookies, so we trust the state parameter
    // But we still validate format and ensure it's not tampered
    if (clientType !== "cli" && storedState && state !== storedState) {
      return res.status(400).json({
        status: "error",
        message: "Invalid state parameter",
      });
    }

    // Validate code_verifier format
    if (typeof code_verifier !== "string" || code_verifier.length < 43) {
      return res.status(400).json({
        status: "error",
        message: "Invalid code_verifier format",
      });
    }

    const authResult = await authService.handleGitHubCallback(
      code,
      state,
      code_verifier,
    );

    // Clear OAuth cookie if it exists
    res.clearCookie("oauth_state");

    // For web portal: set HTTP-only cookies
    if (clientType === "web") {
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

// New endpoint for CLI to get auth URL
export const getCLIAuthUrl = async (req: Request, res: Response) => {
  try {
    const { code_challenge } = req.body;

    if (!code_challenge) {
      return res.status(400).json({
        status: "error",
        message: "code_challenge is required",
      });
    }

    const { url, state } = await authService.initiateGitHubAuth(code_challenge);

    // For CLI, we don't set cookies - just return state
    // CLI will manage its own state validation
    res.json({
      status: "success",
      data: {
        url,
        state,
      },
    });
  } catch (error) {
    console.error("CLI auth URL error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate auth URL",
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
    res.clearCookie("oauth_state");

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
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to get user info",
    });
  }
};
