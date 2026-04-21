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
  country_name: string;
  country_probability: number;
  created_at: string;
}

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

export interface CountryMapping {
  [key: string]: string;
}
