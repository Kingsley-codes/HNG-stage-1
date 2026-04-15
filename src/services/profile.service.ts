import { Profile, ProfileFilter } from "../types";
import { generateUUIDv7 } from "../utils/uuid";
import { getAgeGroup } from "../utils/validators";
import type { JsonDatabase } from "../db/database";
import { apiService } from "./api.service";

export class ProfileService {
  private db: JsonDatabase;

  constructor(db: JsonDatabase) {
    this.db = db;
  }

  async createProfile(name: string): Promise<Profile> {
    // Check if profile already exists
    const existing = await this.findByName(name);
    if (existing) {
      return existing;
    }

    // Enrich profile with external APIs
    const enriched = await apiService.enrichProfile(name);
    const ageGroup = getAgeGroup(enriched.age);

    const profile: Profile = {
      id: generateUUIDv7(),
      name: name.toLowerCase(),
      gender: enriched.gender,
      gender_probability: enriched.genderProbability,
      sample_size: enriched.sampleSize,
      age: enriched.age,
      age_group: ageGroup,
      country_id: enriched.countryId,
      country_probability: enriched.countryProbability,
      created_at: new Date().toISOString(),
    };

    await this.db.insert(profile);
    return profile;
  }

  async findById(id: string): Promise<Profile | null> {
    return this.db.findById(id);
  }

  async findByName(name: string): Promise<Profile | null> {
    return this.db.findByName(name);
  }

  async findAll(filters?: ProfileFilter): Promise<Profile[]> {
    return this.db.findAll(filters);
  }

  async delete(id: string): Promise<boolean> {
    return this.db.delete(id);
  }
}
