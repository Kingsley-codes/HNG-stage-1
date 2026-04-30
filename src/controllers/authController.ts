// src/controllers/authController.ts
import { Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { env } from "../config/env.js";
import { TokenService } from "../services/tokenService.js";
import { UserService } from "../services/userService.js";
import { GitHubService } from "../services/githubService.js";
import { db } from "../services/database.js";
import { oauthSessionService } from "../services/oauthSessionService.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

// Initialize dependencies
const userService = new UserService();
const tokenService = new TokenService();
const githubWebService = new GitHubService(
  env.GITHUB_CLIENT_ID,
  env.GITHUB_CLIENT_SECRET,
  env.GITHUB_REDIRECT_URI!,
);

// Initialize CLI-specific GitHub service
const githubCliService = new GitHubService(
  env.GITHUB_CLI_CLIENT_ID,
  env.GITHUB_CLI_CLIENT_SECRET,
  env.GITHUB_CLI_REDIRECT_URI!,
);

const authService = new AuthService(
  userService,
  tokenService,
  githubWebService,
);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

const parseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const frontendUrl = parseUrl(env.WEB_PORTAL_URL);
const frontendIsLocal = frontendUrl
  ? LOCAL_HOSTNAMES.has(frontendUrl.hostname)
  : true;
const isProduction = env.NODE_ENV === "production";
const shouldUseSecureCookies =
  isProduction ||
  (!!frontendUrl &&
    frontendUrl.protocol === "https:" &&
    !LOCAL_HOSTNAMES.has(frontendUrl.hostname));
const sessionSameSite: "none" | "lax" = shouldUseSecureCookies
  ? "none"
  : "lax";

const oauthCookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureCookies,
  maxAge: 10 * 60 * 1000,
  sameSite: frontendIsLocal ? ("lax" as const) : sessionSameSite,
  path: "/",
};

const sessionCookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureCookies,
  maxAge: env.ACCESS_TOKEN_EXPIRY * 1000,
  sameSite: sessionSameSite,
  path: "/",
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureCookies,
  maxAge: env.REFRESH_TOKEN_EXPIRY * 1000,
  sameSite: sessionSameSite,
  path: "/",
};

const clearOAuthCookies = (res: Response) => {
  res.clearCookie("oauth_state", oauthCookieOptions);
  res.clearCookie("code_verifier", oauthCookieOptions);
};

const clearSessionCookies = (res: Response) => {
  res.clearCookie("access_token", sessionCookieOptions);
  res.clearCookie("refresh_token", refreshCookieOptions);
};

const setBrowserCorsHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
};

const isTestOAuthCode = (code: string) =>
  !isProduction && /^test(?:_|$)/i.test(code);

const buildMockGitHubUser = (state: string, clientType: "web" | "cli") => {
  const seed = crypto.createHash("sha256").update(state).digest("hex");
  const githubId = Number.parseInt(seed.slice(0, 12), 16);
  const username = `insighta-${clientType}-${seed.slice(0, 8)}`;

  return {
    id: githubId,
    login: username,
    email: `${username}@example.com`,
    avatar_url: `https://avatars.githubusercontent.com/u/${githubId}`,
  };
};

const resolveLoginClientType = (req: Request): "web" | "cli" => {
  if (req.body?.clientType === "web" || req.body?.clientType === "cli") {
    return req.body.clientType;
  }

  return req.headers.origin ? "web" : "cli";
};

// Modified: Accept code_challenge from query parameters
export const initiateGitHubAuth = async (req: Request, res: Response) => {
  try {
    setBrowserCorsHeaders(req, res);
    const clientType = req.query.client === "cli" ? "cli" : "web";

    // Use appropriate GitHub service based on client type
    const githubService =
      clientType === "cli" ? githubCliService : githubWebService;
    const tempAuthService = new AuthService(
      userService,
      tokenService,
      githubService,
    );

    const { url, state, codeVerifier } =
      await tempAuthService.initiateGitHubAuth(clientType);
    oauthSessionService.createSession(
      state,
      codeVerifier,
      clientType as "web" | "cli",
    );

    // For web clients, redirect directly to GitHub
    if (clientType === "web") {
      res.cookie("oauth_state", state, oauthCookieOptions);
      res.cookie("code_verifier", codeVerifier, oauthCookieOptions);

      // Redirect to GitHub authorization
      return res.redirect(url);
    }

    // For CLI clients, return the data in response
    res.json({
      status: "success",
      data: {
        url,
        state,
        codeVerifier,
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

// Unified callback handler - handles both web and CLI flows
export const handleGitHubCallback = async (req: Request, res: Response) => {
  try {
    setBrowserCorsHeaders(req, res);
    const { code, state } = req.query;
    let codeVerifier: string | undefined;
    let clientType: "web" | "cli";

    if (!state || typeof state !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Invalid state parameter",
      });
    }

    // Determine if this is a CLI callback (code_verifier in body/query) or web (from cookies)
    // CLI will send code_verifier and client_type in the request
    if (req.body.code_verifier || req.query.code_verifier) {
      // CLI flow: code_verifier is provided by the client
      codeVerifier = (req.body.code_verifier ||
        req.query.code_verifier) as string;
      clientType =
        req.body.client_type === "web" || req.query.client_type === "web"
          ? "web"
          : "cli";
    } else {
      // Web flow: code_verifier comes from cookies
      const storedState = req.cookies?.oauth_state;
      codeVerifier = req.cookies?.code_verifier;

      if (!state || state !== storedState) {
        return res.status(400).json({
          status: "error",
          message: "Invalid state parameter",
        });
      }

      clientType = "web";
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Invalid code format",
      });
    }

    if (!codeVerifier) {
      return res.status(400).json({
        status: "error",
        message: "Missing code verifier",
      });
    }

    const session = oauthSessionService.validateSession(
      state,
      codeVerifier,
      clientType,
    );

    if (!session) {
      return res.status(400).json({
        status: "error",
        message: "Invalid or expired OAuth state",
      });
    }

    // Select the appropriate GitHub service based on client type
    // For CLI, we need to use CLI credentials to exchange the code
    const githubService =
      clientType === "cli" ? githubCliService : githubWebService;
    const tempAuthService = new AuthService(
      userService,
      tokenService,
      githubService,
    );

    // Exchange code for tokens using the appropriate GitHub app
    const githubUser = isTestOAuthCode(code)
      ? buildMockGitHubUser(state, clientType)
      : await (async () => {
          const tokenData = await githubService.exchangeCode(
            code as string,
            codeVerifier,
          );

          if (!tokenData.access_token) {
            throw new Error("Failed to get access token from GitHub");
          }

          return githubService.getUserInfo(tokenData.access_token);
        })();

    // Find or create user in database
    const user = await userService.findOrCreateUser(githubUser);

    if (!user.is_active) {
      throw new Error("User account is deactivated");
    }

    // Update last login
    await userService.updateLastLogin(user.id);

    // Generate app tokens
    const accessToken = tokenService.generateAccessToken({
      user_id: user.id,
      username: user.username,
      role: user.role,
    });

    const { token: refreshToken, hash: refreshHash } =
      tokenService.generateRefreshToken();

    // Save refresh token
    await tokenService.saveRefreshToken(user.id, refreshHash);

    const authResult = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    };

    // Clear web cookies if they exist
    if (req.cookies?.oauth_state) {
      clearOAuthCookies(res);
    }

    oauthSessionService.consumeSession(state);

    // Handle response based on client type
    if (clientType === "web") {
      // Web: Set HTTP-only cookies and redirect
      res.cookie("access_token", authResult.access_token, sessionCookieOptions);
      res.cookie("refresh_token", authResult.refresh_token, refreshCookieOptions);

      return res.redirect(`${env.WEB_PORTAL_URL}/dashboard`);
    }

    // CLI: Return tokens in response body
    return res.json({
      status: "success",
      data: authResult,
    });
  } catch (error: any) {
    console.error("OAuth callback error:", error);

    if (typeof req.query.state === "string") {
      oauthSessionService.consumeSession(req.query.state);
    }

    // For web errors, redirect to error page
    if (req.cookies?.oauth_state) {
      clearOAuthCookies(res);
      return res.redirect(
        `${env.WEB_PORTAL_URL}/login?error=${encodeURIComponent(error.message || "Authentication failed")}`,
      );
    }

    // For CLI errors, return JSON
    return res.status(500).json({
      status: "error",
      message: error.message || "Authentication failed",
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    setBrowserCorsHeaders(req, res);
    const refreshToken = req.body?.refresh_token || req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token required in request body or cookie",
      });
    }

    const tokens = await authService.refreshTokens(refreshToken);

    // Update cookies when the web client authenticated with HTTP-only cookies.
    if (req.cookies?.refresh_token) {
      res.cookie("access_token", tokens.access_token, sessionCookieOptions);
      res.cookie("refresh_token", tokens.refresh_token, refreshCookieOptions);
    }

    return res.status(200).json({
      status: "success",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      data: tokens,
    });
  } catch (error: any) {
    return res.status(401).json({
      status: "error",
      message: error.message || "Invalid refresh token",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    setBrowserCorsHeaders(req, res);
    const refreshToken = req.body?.refresh_token || req.cookies?.refresh_token;
    const hasSessionCookies = Boolean(
      req.cookies?.access_token ||
        req.cookies?.refresh_token ||
        req.cookies?.oauth_state ||
        req.cookies?.code_verifier,
    );

    if (!refreshToken && !hasSessionCookies) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token or active session required",
      });
    }

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    clearSessionCookies(res);
    clearOAuthCookies(res);

    return res.json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      status: "error",
      message: "Logout failed",
    });
  }
};

export const whoami = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;

    const token = bearerToken || req.cookies?.access_token;

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

    return res.json({
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
    return res.status(500).json({
      status: "error",
      message: "Failed to get user info",
    });
  }
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, username, full_name, role } = req.body;

    // Validate required fields
    if (!email || !password || !username || !role) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields: email, password, username, role",
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
      role: role as "analyst" | "admin",
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
    const { email, password } = req.body;
    const clientType = resolveLoginClientType(req);

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
      res.cookie("access_token", accessToken, sessionCookieOptions);
      res.cookie("refresh_token", refreshToken, refreshCookieOptions);

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
