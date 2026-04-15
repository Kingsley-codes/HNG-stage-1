import fs from "fs/promises";
import path from "path";
import { Profile } from "../types";

class JsonDatabase {
  private data: Map<string, Profile> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name -> id
  private filePath: string;
  private initialized: boolean = false;

  constructor() {
    this.filePath = path.join(__dirname, "../../profiles.json");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Try to read existing data
      const fileContent = await fs.readFile(this.filePath, "utf-8");
      const records: Profile[] = JSON.parse(fileContent);

      // Rebuild indexes
      for (const record of records) {
        this.data.set(record.id, record);
        this.nameIndex.set(record.name.toLowerCase(), record.id);
      }

      console.log(`📂 Loaded ${this.data.size} profiles from database`);
    } catch (error) {
      // File doesn't exist, create empty database
      await this.persist();
      console.log("📂 Created new database file");
    }

    this.initialized = true;
  }

  private async persist(): Promise<void> {
    const records = Array.from(this.data.values());
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2));
  }

  async insert(profile: Profile): Promise<void> {
    const nameKey = profile.name.toLowerCase();

    // Check if name already exists
    if (this.nameIndex.has(nameKey)) {
      throw new Error("UNIQUE constraint failed: profiles.name");
    }

    this.data.set(profile.id, profile);
    this.nameIndex.set(nameKey, profile.id);
    await this.persist();
  }

  async findById(id: string): Promise<Profile | null> {
    return this.data.get(id) || null;
  }

  async findByName(name: string): Promise<Profile | null> {
    const id = this.nameIndex.get(name.toLowerCase());
    return id ? this.data.get(id) || null : null;
  }

  async findAll(filters?: {
    gender?: string;
    country_id?: string;
    age_group?: string;
  }): Promise<Profile[]> {
    let records = Array.from(this.data.values());

    if (filters?.gender) {
      records = records.filter(
        (r) => r.gender.toLowerCase() === filters.gender!.toLowerCase(),
      );
    }

    if (filters?.country_id) {
      records = records.filter(
        (r) => r.country_id === filters.country_id!.toUpperCase(),
      );
    }

    if (filters?.age_group) {
      records = records.filter((r) => r.age_group === filters.age_group);
    }

    // Sort by created_at descending
    return records.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  async delete(id: string): Promise<boolean> {
    const profile = this.data.get(id);

    if (!profile) {
      return false;
    }

    this.nameIndex.delete(profile.name.toLowerCase());
    this.data.delete(id);
    await this.persist();

    return true;
  }

  async clear(): Promise<void> {
    this.data.clear();
    this.nameIndex.clear();
    await this.persist();
  }

  get size(): number {
    return this.data.size;
  }
}

let db: JsonDatabase | null = null;

export const initializeDatabase = async (): Promise<JsonDatabase> => {
  if (db) return db;

  db = new JsonDatabase();
  await db.initialize();
  return db;
};

export const getDatabase = (): JsonDatabase => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  // Nothing to close for JSON database
  db = null;
};

// Export the type for use in other files
export type { JsonDatabase };
