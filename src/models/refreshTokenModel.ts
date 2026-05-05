import {
  CreateIndexesOptions,
  IndexDirection,
  IndexSpecification,
} from "mongodb";
import { RefreshToken } from "../types/index.js";

export interface RefreshTokenDocument extends RefreshToken {
  expires_at_date: Date;
}

export const REFRESH_TOKEN_COLLECTION = "refresh_tokens";

export const REFRESH_TOKEN_INDEXES: Array<{
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}> = [
  {
    key: { token_hash: 1 as IndexDirection },
    options: { unique: true },
  },
  {
    key: { user_id: 1 as IndexDirection, revoked_at: 1 as IndexDirection },
  },
  {
    key: { expires_at_date: 1 as IndexDirection },
    options: { expireAfterSeconds: 0 },
  },
];

export function toRefreshTokenDocument(
  token: RefreshToken,
): RefreshTokenDocument {
  return {
    ...token,
    expires_at_date: new Date(token.expires_at),
  };
}
