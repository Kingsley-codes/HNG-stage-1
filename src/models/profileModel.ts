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
    options: {
      unique: true,
      name: "profile_id_unique",
    },
  },
  {
    key: { name_key: 1 as IndexDirection },
    options: {
      unique: true,
      name: "profile_name_key_unique",
    },
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
