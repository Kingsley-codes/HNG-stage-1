// src/services/database.ts
import fs from "fs";
import { Profile, User, RefreshToken } from "../types/index.js";
import crypto from "crypto";

interface Database {
  profiles: Map<string, Profile>;
  nameIndex: Map<string, string>;
  users: Map<string, User>; // New: user storage
  githubIndex: Map<number, string>; // New: github_id -> user_id
  refreshTokens: Map<string, RefreshToken>; // New: token hash -> token data
}

const COUNTRY_NAMES: { [key: string]: string } = {
  NG: "Nigeria",
  BJ: "Benin",
  GH: "Ghana",
  CI: "Ivory Coast",
  SN: "Senegal",
  CM: "Cameroon",
  KE: "Kenya",
  ZA: "South Africa",
  AO: "Angola",
  ML: "Mali",
  BF: "Burkina Faso",
  NE: "Niger",
  TD: "Chad",
  SO: "Somalia",
  SD: "Sudan",
  UG: "Uganda",
  TZ: "Tanzania",
  RW: "Rwanda",
  ET: "Ethiopia",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  MW: "Malawi",
  MZ: "Mozambique",
  MG: "Madagascar",
  CD: "DR Congo",
  CG: "Congo",
  GA: "Gabon",
  LR: "Liberia",
  SL: "Sierra Leone",
  GN: "Guinea",
  GM: "Gambia",
  MR: "Mauritania",
  EH: "Western Sahara",
  TN: "Tunisia",
  DZ: "Algeria",
  MA: "Morocco",
  LY: "Libya",
  EG: "Egypt",
  SS: "South Sudan",
  DJ: "Djibouti",
  ER: "Eritrea",
  BI: "Burundi",
  NA: "Namibia",
  BW: "Botswana",
  LS: "Lesotho",
  SZ: "Eswatini",
  KM: "Comoros",
  CV: "Cabo Verde",
  ST: "Sao Tome and Principe",
  MU: "Mauritius",
  SC: "Seychelles",
  GQ: "Equatorial Guinea",
};

class LocalDB {
  private db: Database;
  private dataFile = "./data.json";

  constructor() {
    this.db = {
      profiles: new Map(),
      nameIndex: new Map(),
      users: new Map(),
      githubIndex: new Map(),
      refreshTokens: new Map(),
    };
    this.loadFromFile();

    // Create default admin user if none exists
    this.ensureDefaultAdmin();
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, "utf8");
        const parsed = JSON.parse(data);

        this.db.profiles = new Map(Object.entries(parsed.profiles || {}));
        this.db.nameIndex = new Map(Object.entries(parsed.nameIndex || {}));
        this.db.users = new Map(Object.entries(parsed.users || {}));

        // Fix: Convert string keys back to numbers for githubIndex
        const githubIndexEntries = Object.entries(parsed.githubIndex || {});
        this.db.githubIndex = new Map(
          githubIndexEntries.map(([key, value]) => [
            parseInt(key, 10),
            value as string,
          ]),
        );

        this.db.refreshTokens = new Map(
          Object.entries(parsed.refreshTokens || {}),
        );
      }
    } catch (error) {
      console.log("Starting with empty database");
    }
  }

  private saveToFile(): void {
    try {
      const data = {
        profiles: Object.fromEntries(this.db.profiles),
        nameIndex: Object.fromEntries(this.db.nameIndex),
        users: Object.fromEntries(this.db.users),
        githubIndex: Object.fromEntries(this.db.githubIndex),
        refreshTokens: Object.fromEntries(this.db.refreshTokens),
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving to file:", error);
    }
  }

  private ensureDefaultAdmin(): void {
    // Check if any admin exists
    let hasAdmin = false;
    for (const user of this.db.users.values()) {
      if (user.role === "admin") {
        hasAdmin = true;
        break;
      }
    }

    if (!hasAdmin) {
      console.log("⚠️  No admin user found. Create one via CLI or API.");
      console.log(
        "   Run: insighta create-admin --username admin --github-id <your_github_id>",
      );
    }
  }

  // ========== Profile Methods (Existing) ==========
  saveProfile(profile: Profile): void {
    this.db.profiles.set(profile.id, profile);
    this.db.nameIndex.set(profile.name.toLowerCase(), profile.id);
    this.saveToFile();
  }

  getProfile(id: string): Profile | undefined {
    return this.db.profiles.get(id);
  }

  getProfileByName(name: string): Profile | undefined {
    const id = this.db.nameIndex.get(name.toLowerCase());
    return id ? this.db.profiles.get(id) : undefined;
  }

  getAllProfiles(): Profile[] {
    return Array.from(this.db.profiles.values());
  }

  deleteProfile(id: string): boolean {
    const profile = this.db.profiles.get(id);
    if (profile) {
      this.db.profiles.delete(id);
      this.db.nameIndex.delete(profile.name.toLowerCase());
      this.saveToFile();
      return true;
    }
    return false;
  }

  getProfileCount(): number {
    return this.db.profiles.size;
  }

  // ========== User Methods (New) ==========
  findOrCreateUser(githubUser: any): User {
    // Check if user exists by github_id
    let userId = this.db.githubIndex.get(githubUser.id);

    if (userId) {
      // User exists, update last login
      const user = this.db.users.get(userId);
      if (user) {
        user.last_login_at = new Date().toISOString();
        this.db.users.set(userId, user);
        this.saveToFile();
        return user;
      }
    }

    // Create new user
    const newUser: User = {
      id: crypto.randomUUID(),
      github_id: githubUser.id,
      username: githubUser.login,
      email: githubUser.email || null,
      avatar_url: githubUser.avatar_url || null,
      role: "analyst", // Default role
      is_active: true,
      last_login_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    this.db.users.set(newUser.id, newUser);
    this.db.githubIndex.set(githubUser.id, newUser.id);
    this.saveToFile();

    return newUser;
  }

  getUserById(id: string): User | undefined {
    return this.db.users.get(id);
  }

  getUserByGithubId(githubId: number): User | undefined {
    const userId = this.db.githubIndex.get(githubId);
    return userId ? this.db.users.get(userId) : undefined;
  }

  getAllUsers(): User[] {
    return Array.from(this.db.users.values());
  }

  updateUserRole(userId: string, role: "admin" | "analyst"): User | undefined {
    const user = this.db.users.get(userId);
    if (user) {
      user.role = role;
      this.db.users.set(userId, user);
      this.saveToFile();
      return user;
    }
    return undefined;
  }

  deactivateUser(userId: string): boolean {
    const user = this.db.users.get(userId);
    if (user) {
      user.is_active = false;
      this.db.users.set(userId, user);
      this.saveToFile();
      return true;
    }
    return false;
  }

  // ========== Refresh Token Methods (New) ==========
  saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresInSeconds: number,
  ): void {
    const refreshToken: RefreshToken = {
      id: crypto.randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      created_at: new Date().toISOString(),
      revoked_at: null,
    };

    this.db.refreshTokens.set(tokenHash, refreshToken);
    this.saveToFile();
  }

  findValidRefreshToken(tokenHash: string): { user_id: string } | null {
    const token = this.db.refreshTokens.get(tokenHash);

    if (!token || token.revoked_at || new Date(token.expires_at) < new Date()) {
      return null;
    }

    return { user_id: token.user_id };
  }

  revokeRefreshToken(tokenHash: string): void {
    const token = this.db.refreshTokens.get(tokenHash);
    if (token) {
      token.revoked_at = new Date().toISOString();
      this.db.refreshTokens.set(tokenHash, token);
      this.saveToFile();
    }
  }

  revokeAllUserRefreshTokens(userId: string): void {
    for (const [hash, token] of this.db.refreshTokens.entries()) {
      if (token.user_id === userId && !token.revoked_at) {
        token.revoked_at = new Date().toISOString();
        this.db.refreshTokens.set(hash, token);
      }
    }
    this.saveToFile();
  }

  cleanupExpiredTokens(): void {
    let changed = false;
    for (const [hash, token] of this.db.refreshTokens.entries()) {
      if (new Date(token.expires_at) < new Date()) {
        this.db.refreshTokens.delete(hash);
        changed = true;
      }
    }
    if (changed) {
      this.saveToFile();
    }
  }

  // ========== Helper Methods ==========
  getCountryName(countryId: string): string {
    return COUNTRY_NAMES[countryId.toUpperCase()] || countryId;
  }

  clearDatabase(): void {
    this.db.profiles.clear();
    this.db.nameIndex.clear();
    this.db.users.clear();
    this.db.githubIndex.clear();
    this.db.refreshTokens.clear();
    this.saveToFile();
  }
}

export const db = new LocalDB();
