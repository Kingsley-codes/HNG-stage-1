import {
  CreateIndexesOptions,
  IndexDirection,
  IndexSpecification,
} from "mongodb";
import { Profile } from "../types/index.js";

export interface ProfileDocument extends Profile {
  name_key: string;
  created_at_date: Date;
}

export const PROFILE_COLLECTION = "profiles";

export const PROFILE_INDEXES: Array<{
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}> = [
  {
    key: { id: 1 as IndexDirection },
    options: { unique: true },
  },
  {
    key: { name_key: 1 as IndexDirection },
    options: { unique: true },
  },
  {
    key: {
      gender: 1 as IndexDirection,
      age_group: 1 as IndexDirection,
      country_id: 1 as IndexDirection,
      created_at_date: -1 as IndexDirection,
    },
  },
  {
    key: {
      country_id: 1 as IndexDirection,
      age: 1 as IndexDirection,
    },
  },
  {
    key: { gender_probability: 1 as IndexDirection },
  },
];

export function buildProfileNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function toProfileDocument(profile: Profile): ProfileDocument {
  return {
    ...profile,
    name_key: buildProfileNameKey(profile.name),
    created_at_date: new Date(profile.created_at),
  };
}

export function toProfile(document: ProfileDocument): Profile {
  const { name_key, created_at_date, ...profile } = document;
  return profile;
}
