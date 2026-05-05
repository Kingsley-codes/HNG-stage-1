import {
  CreateIndexesOptions,
  IndexDirection,
  IndexSpecification,
} from "mongodb";
import { User } from "../types/index.js";

export interface UserDocument extends User {
  email_key: string | null;
  username_key: string;
}

export const USER_COLLECTION = "users";

export const USER_INDEXES: Array<{
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}> = [
  {
    key: { id: 1 as IndexDirection },
    options: { unique: true },
  },
  {
    key: { github_id: 1 as IndexDirection },
    options: { unique: true, sparse: true },
  },
  {
    key: { email_key: 1 as IndexDirection },
    options: { unique: true, sparse: true },
  },
  {
    key: { username_key: 1 as IndexDirection },
    options: { unique: true },
  },
];

export function buildEmailKey(email: string | null | undefined): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export function buildUsernameKey(username: string): string {
  return username.trim().toLowerCase();
}

export function toUserDocument(user: User): UserDocument {
  return {
    ...user,
    email_key: buildEmailKey(user.email),
    username_key: buildUsernameKey(user.username),
  };
}

export function toUser(document: UserDocument): User {
  const { email_key, username_key, ...user } = document;
  return user;
}
