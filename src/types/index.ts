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
  age_group: "child" | "teenager" | "adult" | "senior";
  country_id: string;
  country_probability: number;
  created_at: string;
}

export interface CreateProfileRequest {
  name: string;
}

export interface ApiResponse<T> {
  status: string;
  data?: T;
  message?: string;
  count?: number;
}

export interface ErrorResponse {
  status: string;
  message: string;
}

export type AgeGroup = "child" | "teenager" | "adult" | "senior";

export interface ProfileFilter {
  gender?: string;
  country_id?: string;
  age_group?: string;
}
