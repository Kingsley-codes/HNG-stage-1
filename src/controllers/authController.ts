// src/controllers/authController.ts
import { Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { env } from "../config/env.js";
import { TokenService } from "../services/tokenService.js";
import { UserService } from "../services/userService.js";
import { GitHubService } from "../services/githubService.js";
import { db } from "../services/database.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

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

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, username, full_name } = req.body;

    // Validate required fields
    if (!email || !password || !username) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: email, password, username",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email format",
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long",
      });
    }

    // Check for strong password (optional but recommended)
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar)) {
      return res.status(400).json({
        status: "error",
        message:
          "Password must contain uppercase, lowercase, number, and special character",
      });
    }

    // Check if user already exists
    const existingUserByEmail = await userService.getUserByEmail(email);
    if (existingUserByEmail) {
      return res.status(409).json({
        status: "error",
        message: "User with this email already exists",
      });
    }

    const existingUserByUsername =
      await userService.getUserByUsername(username);
    if (existingUserByUsername) {
      return res.status(409).json({
        status: "error",
        message: "Username already taken",
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create new user
    const newUser = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      full_name: full_name || null,
      password_hash: passwordHash,
      role: "analyst" as "analyst",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: null,
      github_id: null,
      avatar_url: null,
    };

    const createdUser = await userService.createUser(newUser);

    // Return user data (excluding sensitive info) and tokens
    res.status(201).json({
      status: "success",
      message: "User created successfully. Please verify your email.",
      data: {
        user: {
          id: createdUser.id,
          email: createdUser.email,
          username: createdUser.username,
          full_name: createdUser.full_name,
          role: createdUser.role,
        },
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create user",
    });
  }
};

// ========== NEW: Email/Password Login ==========
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, clientType = "web" } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    // Find user by email
    const user = await userService.getUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        status: "error",
        message: "Account is deactivated. Please contact support.",
      });
    }

    // Check if user has a password (not a GitHub-only account)
    if (!user.password_hash) {
      return res.status(401).json({
        status: "error",
        message:
          "This account uses GitHub login. Please use 'Continue with GitHub' option.",
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Update last login
    await userService.updateLastLogin(user.id);

    // Generate tokens
    const accessToken = tokenService.generateAccessToken({
      user_id: user.id,
      username: user.username,
      role: user.role as "admin" | "analyst",
    });

    const { token: refreshToken, hash: refreshTokenHash } =
      tokenService.generateRefreshToken();

    db.saveRefreshToken(user.id, refreshTokenHash, env.REFRESH_TOKEN_EXPIRY);

    // For web portal: set HTTP-only cookies
    if (clientType === "web") {
      res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.ACCESS_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });

      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: env.REFRESH_TOKEN_EXPIRY * 1000,
        sameSite: "strict",
      });

      // Return success without tokens in body for web
      return res.json({
        status: "success",
        message: "Login successful",
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            role: user.role as "admin" | "analyst",
            avatar_url: user.avatar_url,
          },
        },
      });
    }

    // For CLI/API: return tokens in response
    res.json({
      status: "success",
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          role: user.role as "admin" | "analyst",
          avatar_url: user.avatar_url,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      status: "error",
      message: "Login failed",
    });
  }
};
