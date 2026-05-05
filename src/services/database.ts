import fs from "fs";
import { promises as fsPromises } from "fs";
import crypto from "crypto";
import {
  FilterOptions,
  Profile,
  QueryExecutionOptions,
  QueryExecutionResult,
  RefreshToken,
  User,
} from "../types/index.js";
import { ProfileQueryEngine } from "./profileQueryEngine.js";

interface Database {
  users: Map<string, User>;
  githubIndex: Map<number, string>;
  refreshTokens: Map<string, RefreshToken>;
}

const COUNTRY_NAMES: Record<string, string> = {
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
  private readonly profiles = new ProfileQueryEngine();
  private readonly dataFile = "./data.json";
  private persistRequested = false;
  private persistPromise: Promise<void> | null = null;

  constructor() {
    this.db = {
      users: new Map(),
      githubIndex: new Map(),
      refreshTokens: new Map(),
    };
    this.loadFromFile();
    this.ensureDefaultAdmin();
  }

  private loadFromFile(): void {
    try {
      if (!fs.existsSync(this.dataFile)) {
        return;
      }

      const data = fs.readFileSync(this.dataFile, "utf8");
      const parsed = JSON.parse(data);

      this.profiles.hydrate(
        Object.values((parsed.profiles ?? {}) as Record<string, Profile>),
      );
      this.db.users = new Map(Object.entries(parsed.users ?? {}));
      this.db.githubIndex = new Map(
        Object.entries(parsed.githubIndex ?? {}).map(([key, value]) => [
          Number.parseInt(key, 10),
          value as string,
        ]),
      );
      this.db.refreshTokens = new Map(
        Object.entries(parsed.refreshTokens ?? {}),
      );
    } catch (error) {
      console.log("Starting with empty database");
    }
  }

  private serialize(): string {
    return JSON.stringify(
      {
        profiles: this.profiles.getProfilesSnapshot(),
        nameIndex: this.profiles.getNameIndexSnapshot(),
        users: Object.fromEntries(this.db.users),
        githubIndex: Object.fromEntries(this.db.githubIndex),
        refreshTokens: Object.fromEntries(this.db.refreshTokens),
      },
      null,
      2,
    );
  }

  private schedulePersist(): Promise<void> {
    this.persistRequested = true;

    if (!this.persistPromise) {
      this.persistPromise = this.flushPersistLoop();
    }

    return this.persistPromise;
  }

  private async flushPersistLoop(): Promise<void> {
    while (this.persistRequested) {
      this.persistRequested = false;
      const payload = this.serialize();
      const tempFile = `${this.dataFile}.tmp`;
      await fsPromises.writeFile(tempFile, payload, "utf8");
      await fsPromises.rename(tempFile, this.dataFile);
    }

    this.persistPromise = null;
  }

  async flush(): Promise<void> {
    if (!this.persistPromise) {
      if (!this.persistRequested) {
        return;
      }

      this.persistPromise = this.flushPersistLoop();
    }

    await this.persistPromise;
  }

  private ensureDefaultAdmin(): void {
    let hasAdmin = false;
    for (const user of this.db.users.values()) {
      if (user.role === "admin") {
        hasAdmin = true;
        break;
      }
    }

    if (!hasAdmin) {
      console.log("No admin user found. Create one via CLI or API.");
      console.log(
        "Run: insighta create-admin --username admin --github-id <your_github_id>",
      );
    }
  }

  saveProfile(profile: Profile): void {
    this.profiles.addProfile(profile);
    void this.schedulePersist();
  }

  bulkInsertProfiles(profiles: Profile[]): { inserted: number; duplicates: number } {
    const accepted: Profile[] = [];
    let duplicates = 0;

    for (const profile of profiles) {
      if (this.profiles.hasProfileName(profile.name)) {
        duplicates++;
        continue;
      }

      accepted.push(profile);
    }

    this.profiles.addProfiles(accepted);
    if (accepted.length > 0) {
      void this.schedulePersist();
    }

    return {
      inserted: accepted.length,
      duplicates,
    };
  }

  getProfile(id: string): Profile | undefined {
    return this.profiles.getProfile(id);
  }

  getProfileByName(name: string): Profile | undefined {
    return this.profiles.getProfileByName(name);
  }

  hasProfileName(name: string): boolean {
    return this.profiles.hasProfileName(name);
  }

  getAllProfiles(): Profile[] {
    return this.profiles.getAllProfiles();
  }

  queryProfiles(
    filters: Partial<FilterOptions>,
    options: Partial<QueryExecutionOptions>,
    scope?: string,
  ): QueryExecutionResult {
    return this.profiles.queryProfiles(filters, options, scope);
  }

  exportProfiles(
    filters: Partial<FilterOptions>,
    options: Partial<QueryExecutionOptions>,
  ): Profile[] {
    return this.profiles.exportProfiles(filters, options);
  }

  deleteProfile(id: string): boolean {
    const deleted = this.profiles.deleteProfile(id);
    if (!deleted) {
      return false;
    }

    void this.schedulePersist();
    return true;
  }

  getProfileCount(): number {
    return this.profiles.getProfileCount();
  }

  updateUserLastLogin(userId: string): void {
    const user = this.db.users.get(userId);
    if (!user) {
      return;
    }

    user.last_login_at = new Date().toISOString();
    this.db.users.set(userId, user);
    void this.schedulePersist();
  }

  updateUser(userId: string, updates: Partial<User>): boolean {
    const user = this.db.users.get(userId);
    if (!user) {
      return false;
    }

    Object.assign(user, updates);
    this.db.users.set(userId, user);
    void this.schedulePersist();
    return true;
  }

  createUserWithPassword(user: User): void {
    this.db.users.set(user.id, user);

    if (user.github_id) {
      this.db.githubIndex.set(user.github_id, user.id);
    }

    void this.schedulePersist();
  }

  findOrCreateUser(githubUser: any): User {
    const existingUserId = this.db.githubIndex.get(githubUser.id);
    if (existingUserId) {
      const existingUser = this.db.users.get(existingUserId);
      if (existingUser) {
        existingUser.last_login_at = new Date().toISOString();
        this.db.users.set(existingUserId, existingUser);
        void this.schedulePersist();
        return existingUser;
      }
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      github_id: githubUser.id,
      username: githubUser.login,
      email: githubUser.email || null,
      avatar_url: githubUser.avatar_url || null,
      role: "analyst",
      is_active: true,
      last_login_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    this.db.users.set(newUser.id, newUser);
    this.db.githubIndex.set(githubUser.id, newUser.id);
    void this.schedulePersist();
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
    if (!user) {
      return undefined;
    }

    user.role = role;
    this.db.users.set(userId, user);
    void this.schedulePersist();
    return user;
  }

  deactivateUser(userId: string): boolean {
    const user = this.db.users.get(userId);
    if (!user) {
      return false;
    }

    user.is_active = false;
    this.db.users.set(userId, user);
    void this.schedulePersist();
    return true;
  }

  saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresInSeconds: number,
  ): void {
    this.db.refreshTokens.set(tokenHash, {
      id: crypto.randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      created_at: new Date().toISOString(),
      revoked_at: null,
    });
    void this.schedulePersist();
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
    if (!token) {
      return;
    }

    token.revoked_at = new Date().toISOString();
    this.db.refreshTokens.set(tokenHash, token);
    void this.schedulePersist();
  }

  revokeAllUserRefreshTokens(userId: string): void {
    let changed = false;

    for (const [hash, token] of this.db.refreshTokens.entries()) {
      if (token.user_id === userId && !token.revoked_at) {
        token.revoked_at = new Date().toISOString();
        this.db.refreshTokens.set(hash, token);
        changed = true;
      }
    }

    if (changed) {
      void this.schedulePersist();
    }
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
      void this.schedulePersist();
    }
  }

  getCountryName(countryId: string): string {
    return COUNTRY_NAMES[countryId.toUpperCase()] || countryId.toUpperCase();
  }

  isKnownCountryCode(countryId: string): boolean {
    return Boolean(COUNTRY_NAMES[countryId.toUpperCase()]);
  }

  clearDatabase(): void {
    this.profiles.clear();
    this.db.users.clear();
    this.db.githubIndex.clear();
    this.db.refreshTokens.clear();
    void this.schedulePersist();
  }
}

export const db = new LocalDB();
