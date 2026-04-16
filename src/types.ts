// src/types.ts
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

export interface Profile {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  sample_size: number;
  age: number;
  age_group: string;
  country_id: string;
  country_probability: number;
  created_at: string;
}

export interface ProfileResponse {
  status: string;
  data?: Profile;
  message?: string;
  count?: number;
}

export interface ProfilesListResponse {
  status: string;
  count: number;
  data: Array<{
    id: string;
    name: string;
    gender: string;
    age: number;
    age_group: string;
    country_id: string;
  }>;
}
