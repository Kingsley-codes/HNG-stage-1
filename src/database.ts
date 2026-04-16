// src/database.ts
import { Profile } from "./types.js";

interface Database {
  profiles: Map<string, Profile>;
  nameIndex: Map<string, string>;
}

class LocalDB {
  private db: Database;
  private dataFile = "./data.json";

  constructor() {
    this.db = {
      profiles: new Map(),
      nameIndex: new Map(),
    };
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      const fs = require("fs");
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, "utf8");
        const parsed = JSON.parse(data);
        this.db.profiles = new Map(Object.entries(parsed.profiles));
        this.db.nameIndex = new Map(Object.entries(parsed.nameIndex));
      }
    } catch (error) {
      console.log("Starting with empty database");
    }
  }

  private saveToFile(): void {
    try {
      const fs = require("fs");
      const data = {
        profiles: Object.fromEntries(this.db.profiles),
        nameIndex: Object.fromEntries(this.db.nameIndex),
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving to file:", error);
    }
  }

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
}

export const db = new LocalDB();
