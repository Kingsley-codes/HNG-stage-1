import fs from "fs";
import crypto from "crypto";
import { Collection, MongoBulkWriteError, MongoServerError } from "mongodb";
import {
  PROFILE_COLLECTION,
  PROFILE_INDEXES,
  ProfileDocument,
  buildProfileNameKey,
  toProfile,
  toProfileDocument,
} from "../models/profileModel.js";
import {
  REFRESH_TOKEN_COLLECTION,
  REFRESH_TOKEN_INDEXES,
  RefreshTokenDocument,
  toRefreshTokenDocument,
} from "../models/refreshTokenModel.js";
import {
  USER_COLLECTION,
  USER_INDEXES,
  UserDocument,
  buildEmailKey,
  buildUsernameKey,
  toUser,
  toUserDocument,
} from "../models/userModel.js";
import {
  FilterOptions,
  Profile,
  QueryExecutionOptions,
  QueryExecutionResult,
  RefreshToken,
  User,
} from "../types/index.js";
import { ProfileQueryEngine } from "./profileQueryEngine.js";
import { mongoConnection } from "./mongoConnection.js";

interface LegacyDataFile {
  profiles?: Record<string, Profile>;
  users?: Record<string, User>;
  refreshTokens?: Record<string, RefreshToken>;
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

class MongoDBService {
  private readonly profiles = new ProfileQueryEngine();
  private readonly dataFile = "./data.json";
  private profilesCollection: Collection<ProfileDocument> | null = null;
  private usersCollection: Collection<UserDocument> | null = null;
  private refreshTokensCollection: Collection<RefreshTokenDocument> | null =
    null;
  private connectPromise: Promise<void> | null = null;
  private profileReadModelRebuildPromise: Promise<void> | null = null;
  private profileReadModelRebuildRequested = false;

  async connect(): Promise<void> {
    if (this.profilesCollection && this.usersCollection && this.refreshTokensCollection) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.initialize().finally(() => {
        this.connectPromise = null;
      });
    }

    await this.connectPromise;
  }

  async disconnect(): Promise<void> {
    await mongoConnection.disconnect();
    this.profilesCollection = null;
    this.usersCollection = null;
    this.refreshTokensCollection = null;
    this.profiles.clear();
  }

  private async initialize(): Promise<void> {
    const database = await mongoConnection.connect();

    this.profilesCollection =
      database.collection<ProfileDocument>(PROFILE_COLLECTION);
    this.usersCollection = database.collection<UserDocument>(USER_COLLECTION);
    this.refreshTokensCollection =
      database.collection<RefreshTokenDocument>(REFRESH_TOKEN_COLLECTION);

    await this.ensureIndexes();
    await this.migrateLocalDataIfNeeded();
    await this.hydrateProfiles();
    await this.ensureDefaultAdmin();
  }

  private async ensureIndexes(): Promise<void> {
    const profilesCollection = this.getProfilesCollection();
    const usersCollection = this.getUsersCollection();
    const refreshTokensCollection = this.getRefreshTokensCollection();

    await Promise.all([
      ...PROFILE_INDEXES.map(({ key, options }) =>
        profilesCollection.createIndex(key, options),
      ),
      ...USER_INDEXES.map(({ key, options }) =>
        usersCollection.createIndex(key, options),
      ),
      ...REFRESH_TOKEN_INDEXES.map(({ key, options }) =>
        refreshTokensCollection.createIndex(key, options),
      ),
    ]);

    await this.pruneProfileIndexes();
  }

  private async pruneProfileIndexes(): Promise<void> {
    const profilesCollection = this.getProfilesCollection();
    const desiredIndexNames = new Set(
      PROFILE_INDEXES.map((index) => index.options?.name).filter(
        (name): name is string => Boolean(name),
      ),
    );

    const existingIndexes = await profilesCollection.listIndexes().toArray();
    const indexesToDrop = existingIndexes
      .map((index) => index.name)
      .filter((name) => name !== "_id_" && !desiredIndexNames.has(name));

    if (indexesToDrop.length === 0) {
      return;
    }

    await Promise.all(
      indexesToDrop.map((indexName) => profilesCollection.dropIndex(indexName)),
    );
  }

  private async migrateLocalDataIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.dataFile)) {
      return;
    }

    const profilesCollection = this.getProfilesCollection();
    const usersCollection = this.getUsersCollection();
    const refreshTokensCollection = this.getRefreshTokensCollection();

    const [profileCount, userCount, refreshTokenCount] = await Promise.all([
      profilesCollection.countDocuments({}, { limit: 1 }),
      usersCollection.countDocuments({}, { limit: 1 }),
      refreshTokensCollection.countDocuments({}, { limit: 1 }),
    ]);

    if (profileCount > 0 && userCount > 0 && refreshTokenCount > 0) {
      return;
    }

    const legacyData = this.readLegacyDataFile();
    if (!legacyData) {
      return;
    }

    if (profileCount === 0) {
      const profiles = Object.values(legacyData.profiles ?? {});
      if (profiles.length > 0) {
        await profilesCollection.insertMany(
          profiles.map((profile) => toProfileDocument(profile)),
          { ordered: false },
        );
        console.log(`Migrated ${profiles.length} profile(s) to MongoDB.`);
      }
    }

    if (userCount === 0) {
      const users = Object.values(legacyData.users ?? {});
      if (users.length > 0) {
        await usersCollection.insertMany(users.map((user) => toUserDocument(user)), {
          ordered: false,
        });
        console.log(`Migrated ${users.length} user(s) to MongoDB.`);
      }
    }

    if (refreshTokenCount === 0) {
      const refreshTokens = Object.values(legacyData.refreshTokens ?? {});
      if (refreshTokens.length > 0) {
        await refreshTokensCollection.insertMany(
          refreshTokens.map((token) => toRefreshTokenDocument(token)),
          { ordered: false },
        );
        console.log(
          `Migrated ${refreshTokens.length} refresh token(s) to MongoDB.`,
        );
      }
    }
  }

  private readLegacyDataFile(): LegacyDataFile | null {
    try {
      const raw = fs.readFileSync(this.dataFile, "utf8");
      return JSON.parse(raw) as LegacyDataFile;
    } catch {
      console.warn("Skipping legacy data migration because data.json is invalid.");
      return null;
    }
  }

  private async hydrateProfiles(): Promise<void> {
    const documents = await this.getProfilesCollection().find({}).toArray();
    this.profiles.hydrate(documents.map((document) => toProfile(document)));
  }

  async rebuildProfileReadModel(): Promise<void> {
    this.profileReadModelRebuildRequested = true;

    if (!this.profileReadModelRebuildPromise) {
      this.profileReadModelRebuildPromise = this.runProfileReadModelRebuildLoop()
        .finally(() => {
          this.profileReadModelRebuildPromise = null;
        });
    }

    await this.profileReadModelRebuildPromise;
  }

  private async runProfileReadModelRebuildLoop(): Promise<void> {
    while (this.profileReadModelRebuildRequested) {
      this.profileReadModelRebuildRequested = false;
      await this.hydrateProfiles();
    }
  }

  private async ensureDefaultAdmin(): Promise<void> {
    const adminCount = await this.getUsersCollection().countDocuments(
      { role: "admin" },
      { limit: 1 },
    );

    if (adminCount === 0) {
      console.log("No admin user found. Create one via signup or direct insert.");
    }
  }

  private getProfilesCollection(): Collection<ProfileDocument> {
    if (!this.profilesCollection) {
      throw new Error("Database not connected");
    }

    return this.profilesCollection;
  }

  private getUsersCollection(): Collection<UserDocument> {
    if (!this.usersCollection) {
      throw new Error("Database not connected");
    }

    return this.usersCollection;
  }

  private getRefreshTokensCollection(): Collection<RefreshTokenDocument> {
    if (!this.refreshTokensCollection) {
      throw new Error("Database not connected");
    }

    return this.refreshTokensCollection;
  }

  async flush(): Promise<void> {
    return Promise.resolve();
  }

  async saveProfile(profile: Profile): Promise<boolean> {
    const result = await this.getProfilesCollection().updateOne(
      { name_key: buildProfileNameKey(profile.name) },
      {
        $setOnInsert: toProfileDocument(profile),
      },
      { upsert: true },
    );

    if (result.upsertedCount === 0) {
      return false;
    }

    this.profiles.addProfile(profile);
    return true;
  }

  async bulkInsertProfiles(
    profiles: Profile[],
    options?: {
      skipReadModelSync?: boolean;
    },
  ): Promise<{ inserted: number; duplicates: number }> {
    if (profiles.length === 0) {
      return { inserted: 0, duplicates: 0 };
    }

    const collection = this.getProfilesCollection();
    const uniqueProfilesByName = new Map<string, Profile>();

    for (const profile of profiles) {
      const nameKey = buildProfileNameKey(profile.name);
      if (!uniqueProfilesByName.has(nameKey)) {
        uniqueProfilesByName.set(nameKey, profile);
      }
    }

    const uniqueProfiles = Array.from(uniqueProfilesByName.values());
    const nameKeys = Array.from(uniqueProfilesByName.keys());

    const existingProfiles = await collection
      .find(
        { name_key: { $in: nameKeys } },
        {
          projection: {
            _id: 0,
            name_key: 1,
          },
        },
      )
      .toArray();

    const existingNameKeys = new Set(
      existingProfiles.map((profile) => profile.name_key),
    );
    const insertCandidates = uniqueProfiles.filter(
      (profile) => !existingNameKeys.has(buildProfileNameKey(profile.name)),
    );

    if (insertCandidates.length === 0) {
      return { inserted: 0, duplicates: profiles.length };
    }

    const candidateDocuments = insertCandidates.map((profile) =>
      toProfileDocument(profile),
    );
    let insertedProfiles: Profile[] = [];

    try {
      await collection.insertMany(candidateDocuments, {
        ordered: false,
      });
      insertedProfiles = insertCandidates;
    } catch (error) {
      if (!(error instanceof MongoBulkWriteError)) {
        throw error;
      }

      const failedIndexes = new Set<number>();

      for (const writeError of Object.values(error.writeErrors ?? {})) {
        if (writeError.code !== 11000) {
          throw error;
        }

        failedIndexes.add(writeError.err.index);
      }

      insertedProfiles = insertCandidates.filter(
        (_profile, index) => !failedIndexes.has(index),
      );
    }

    if (!options?.skipReadModelSync) {
      this.profiles.addProfiles(insertedProfiles);
    }

    return {
      inserted: insertedProfiles.length,
      duplicates: profiles.length - insertedProfiles.length,
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

  async deleteProfile(id: string): Promise<boolean> {
    const deleted = this.profiles.deleteProfile(id);
    if (!deleted) {
      return false;
    }

    await this.getProfilesCollection().deleteOne({ id });
    return true;
  }

  getProfileCount(): number {
    return this.profiles.getProfileCount();
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.getUsersCollection().updateOne(
      { id: userId },
      {
        $set: {
          last_login_at: timestamp,
          updated_at: timestamp,
        },
      },
    );
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<boolean> {
    const updateDocument = this.buildUserUpdateDocument(updates);
    if (Object.keys(updateDocument.$set).length === 0) {
      return false;
    }

    const result = await this.getUsersCollection().updateOne(
      { id: userId },
      updateDocument,
    );

    return result.matchedCount > 0;
  }

  async createUserWithPassword(user: User): Promise<void> {
    await this.getUsersCollection().insertOne(toUserDocument(user));
  }

  async findOrCreateUser(githubUser: any): Promise<User> {
    const timestamp = new Date().toISOString();
    const githubId = Number(githubUser.id);
    const email = githubUser.email ? String(githubUser.email).trim() : null;
    const username = String(githubUser.login).trim();
    const emailKey = buildEmailKey(email);
    const usernameKey = buildUsernameKey(username);
    const usersCollection = this.getUsersCollection();

    const existingByGithubId = await usersCollection.findOne({ github_id: githubId });
    if (existingByGithubId) {
      await usersCollection.updateOne(
        { id: existingByGithubId.id },
        {
          $set: {
            username,
            username_key: usernameKey,
            email,
            email_key: emailKey,
            avatar_url: githubUser.avatar_url || null,
            last_login_at: timestamp,
            updated_at: timestamp,
          },
        },
      );

      return {
        ...toUser(existingByGithubId),
        username,
        email,
        avatar_url: githubUser.avatar_url || null,
        last_login_at: timestamp,
        updated_at: timestamp,
      };
    }

    const localAccountFilter =
      emailKey === null
        ? {
            github_id: null,
            username_key: usernameKey,
          }
        : {
            github_id: null,
            $or: [{ email_key: emailKey }, { username_key: usernameKey }],
          };

    const localAccount = await usersCollection.findOne(localAccountFilter);
    if (localAccount) {
      await usersCollection.updateOne(
        { id: localAccount.id },
        {
          $set: {
            github_id: githubId,
            username,
            username_key: usernameKey,
            email,
            email_key: emailKey,
            avatar_url: githubUser.avatar_url || null,
            last_login_at: timestamp,
            updated_at: timestamp,
          },
        },
      );

      return {
        ...toUser(localAccount),
        github_id: githubId,
        username,
        email,
        avatar_url: githubUser.avatar_url || null,
        last_login_at: timestamp,
        updated_at: timestamp,
      };
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      github_id: githubId,
      username,
      email,
      avatar_url: githubUser.avatar_url || null,
      role: "analyst",
      is_active: true,
      last_login_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };

    try {
      await usersCollection.insertOne(toUserDocument(newUser));
      return newUser;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) {
        throw error;
      }

      const retryFilters =
        emailKey === null
          ? [{ github_id: githubId }, { username_key: usernameKey }]
          : [
              { github_id: githubId },
              { email_key: emailKey },
              { username_key: usernameKey },
            ];

      const retryMatch = await usersCollection.findOne({
        $or: retryFilters,
      });

      if (!retryMatch) {
        throw error;
      }

      return toUser(retryMatch);
    }
  }

  async getUserById(id: string): Promise<User | undefined> {
    const user = await this.getUsersCollection().findOne({ id });
    return user ? toUser(user) : undefined;
  }

  async getUserByGithubId(githubId: number): Promise<User | undefined> {
    const user = await this.getUsersCollection().findOne({ github_id: githubId });
    return user ? toUser(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await this.getUsersCollection().findOne({
      email_key: buildEmailKey(email),
    });
    return user ? toUser(user) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const user = await this.getUsersCollection().findOne({
      username_key: buildUsernameKey(username),
    });
    return user ? toUser(user) : null;
  }

  async getAllUsers(): Promise<User[]> {
    const users = await this.getUsersCollection()
      .find({})
      .sort({ created_at: 1 })
      .toArray();

    return users.map((user) => toUser(user));
  }

  async updateUserRole(
    userId: string,
    role: "admin" | "analyst",
  ): Promise<User | undefined> {
    const result = await this.getUsersCollection().updateOne(
      { id: userId },
      {
        $set: {
          role,
          updated_at: new Date().toISOString(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return undefined;
    }

    return this.getUserById(userId);
  }

  async deactivateUser(userId: string): Promise<boolean> {
    const result = await this.getUsersCollection().updateOne(
      { id: userId },
      {
        $set: {
          is_active: false,
          updated_at: new Date().toISOString(),
        },
      },
    );

    return result.matchedCount > 0;
  }

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const token: RefreshToken = {
      id: crypto.randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      created_at: new Date().toISOString(),
      revoked_at: null,
    };

    await this.getRefreshTokensCollection().insertOne(
      toRefreshTokenDocument(token),
    );
  }

  async findValidRefreshToken(
    tokenHash: string,
  ): Promise<{ user_id: string } | null> {
    const token = await this.getRefreshTokensCollection().findOne({
      token_hash: tokenHash,
      revoked_at: null,
      expires_at_date: { $gt: new Date() },
    });

    if (!token) {
      return null;
    }

    return { user_id: token.user_id };
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.getRefreshTokensCollection().updateOne(
      { token_hash: tokenHash, revoked_at: null },
      {
        $set: {
          revoked_at: new Date().toISOString(),
        },
      },
    );
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.getRefreshTokensCollection().updateMany(
      { user_id: userId, revoked_at: null },
      {
        $set: {
          revoked_at: new Date().toISOString(),
        },
      },
    );
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.getRefreshTokensCollection().deleteMany({
      expires_at_date: { $lt: new Date() },
    });
  }

  getCountryName(countryId: string): string {
    return COUNTRY_NAMES[countryId.toUpperCase()] || countryId.toUpperCase();
  }

  isKnownCountryCode(countryId: string): boolean {
    return Boolean(COUNTRY_NAMES[countryId.toUpperCase()]);
  }

  async clearDatabase(): Promise<void> {
    await Promise.all([
      this.getProfilesCollection().deleteMany({}),
      this.getUsersCollection().deleteMany({}),
      this.getRefreshTokensCollection().deleteMany({}),
    ]);
    this.profiles.clear();
  }

  private buildUserUpdateDocument(updates: Partial<User>): {
    $set: Partial<UserDocument>;
  } {
    const nextUpdates: Partial<UserDocument> = {
      ...updates,
    };

    if (updates.email !== undefined) {
      nextUpdates.email_key = buildEmailKey(updates.email);
    }

    if (updates.username !== undefined) {
      nextUpdates.username_key = buildUsernameKey(updates.username);
    }

    if (Object.keys(nextUpdates).length > 0) {
      nextUpdates.updated_at = new Date().toISOString();
    }

    return {
      $set: nextUpdates,
    };
  }
}

export const db = new MongoDBService();
