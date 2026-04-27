// src/services/authService.ts
import { UserService } from "./userService.js";
import { TokenService } from "./tokenService.js";
import { GitHubService } from "./githubService.js";

export class AuthService {
  private userService: UserService;
  private tokenService: TokenService;
  private githubService: GitHubService;

  constructor(
    userService: UserService,
    tokenService: TokenService,
    githubService: GitHubService,
  ) {
    this.userService = userService;
    this.tokenService = tokenService;
    this.githubService = githubService;
  }

  // Modified: Accept codeChallenge from client (CLI/Web)
  async initiateGitHubAuth(): Promise<{
    url: string;
    state: string;
    codeVerifier: string;
  }> {
    const state = this.githubService.generateState();
    const { codeVerifier, codeChallenge } = this.githubService.generatePKCE();

    // Generate URL with the codeChallenge provided by client
    const url = this.githubService.getAuthorizationUrl(state, codeChallenge);

    return { url, state, codeVerifier };
  }

  // Modified: Accept codeVerifier from client
  async handleGitHubCallback(
    code: string,
    state: string,
    codeVerifier: string, // Now comes from client, not from backend storage
  ): Promise<any> {
    // Exchange code for access token using client's codeVerifier
    const tokenData = await this.githubService.exchangeCode(code, codeVerifier);

    if (!tokenData.access_token) {
      throw new Error("Failed to get access token from GitHub");
    }

    // Get user info from GitHub
    const githubUser = await this.githubService.getUserInfo(
      tokenData.access_token,
    );

    // Find or create user in database
    const user = await this.userService.findOrCreateUser(githubUser);

    if (!user.is_active) {
      throw new Error("User account is deactivated");
    }

    // Update last login
    await this.userService.updateLastLogin(user.id);

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      user_id: user.id,
      username: user.username,
      role: user.role,
    });

    const { token: refreshToken, hash: refreshHash } =
      this.tokenService.generateRefreshToken();

    // Save refresh token
    await this.tokenService.saveRefreshToken(user.id, refreshHash);

    return {
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
  }

  async refreshTokens(refreshToken: string): Promise<any> {
    const refreshHash = this.tokenService.hashRefreshToken(refreshToken);

    // Find valid token
    const tokenData =
      await this.tokenService.findValidRefreshToken(refreshHash);

    if (!tokenData) {
      throw new Error("Invalid or expired refresh token");
    }

    // Get user
    const user = await this.userService.getUserById(tokenData.user_id);

    if (!user || !user.is_active) {
      throw new Error("User not found or inactive");
    }

    // Revoke old token
    await this.tokenService.revokeRefreshToken(refreshHash);

    // Generate new tokens
    const newAccessToken = this.tokenService.generateAccessToken({
      user_id: user.id,
      username: user.username,
      role: user.role,
    });

    const { token: newRefreshToken, hash: newRefreshHash } =
      this.tokenService.generateRefreshToken();

    // Save new refresh token
    await this.tokenService.saveRefreshToken(user.id, newRefreshHash);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshHash = this.tokenService.hashRefreshToken(refreshToken);
    await this.tokenService.revokeRefreshToken(refreshHash);
  }

  async getUserFromId(userId: string): Promise<any> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }
}
