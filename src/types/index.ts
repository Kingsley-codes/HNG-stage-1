// src/types/index.ts

// ========== Existing API Types ==========
export interface GenderizeResponse {
  name: string;
  gender: string | null;
  probability: number;
  count: number;
}

export interface AgifyResponse {
  name: string;
  age: number | null;
  count: number;
}

export interface NationalizeResponse {
  name: string;
  country: Array<{
    country_id: string;
    probability: number;
  }>;
}

// ========== Profile Types ==========
export interface Profile {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  sample_size: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: string;
}

export interface FilterOptions {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
  sort_by?: "age" | "created_at" | "gender_probability";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

// ========== Auth Types (New) ==========
// src/types/index.ts

export interface User {
  id: string;
  github_id: number | null;
  username: string;
  email: string | null;
  full_name?: string | null;
  password_hash?: string | null;
  avatar_url: string | null;
  role: "admin" | "analyst";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface TokenPayload {
  user_id: string;
  username: string;
  role: string;
}

export interface AuthResponse {
  status: string;
  data?: {
    user: {
      id: string;
      username: string;
      email: string | null;
      role: string;
    };
    access_token: string;
    refresh_token: string;
  };
  message?: string;
}

// ========== Pagination Types (Updated) ==========
export interface PaginatedResponse<T> {
  status: string;
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  links: {
    self: string;
    next: string | null;
    prev: string | null;
  };
  data: T[];
}

// ========== Response Types ==========
export interface ProfileResponse {
  status: string;
  data?: Profile;
  message?: string;
}

export interface ProfilesListResponse {
  status: string;
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  links: {
    self: string;
    next: string | null;
    prev: string | null;
  };
  data: Array<{
    id: string;
    name: string;
    gender: string;
    age: number;
    age_group: string;
    country_id: string;
    country_name: string;
  }>;
}

export interface CountryMapping {
  [key: string]: string;
}
