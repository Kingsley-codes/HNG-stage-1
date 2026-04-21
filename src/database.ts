// src/database.ts
import { Profile } from "./types.js";
import fs from "fs";

interface Database {
  profiles: Map<string, Profile>;
  nameIndex: Map<string, string>;
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
    };
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
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

  getCountryName(countryId: string): string {
    return COUNTRY_NAMES[countryId.toUpperCase()] || countryId;
  }

  clearDatabase(): void {
    this.db.profiles.clear();
    this.db.nameIndex.clear();
    this.saveToFile();
  }

  getProfileCount(): number {
    return this.db.profiles.size;
  }
}

export const db = new LocalDB();
