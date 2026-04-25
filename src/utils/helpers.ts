// src/utils/helpers.ts
import { Profile, FilterOptions } from "../types/index.js";

export function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

export function validateName(name: any): string | null {
  if (name === undefined || name === null) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

export function applyFilters(
  profiles: Profile[],
  filters: Partial<FilterOptions>,
): Profile[] {
  let filtered = [...profiles];

  if (filters.gender) {
    filtered = filtered.filter(
      (p) => p.gender.toLowerCase() === filters.gender!.toLowerCase(),
    );
  }

  if (filters.age_group) {
    filtered = filtered.filter(
      (p) => p.age_group.toLowerCase() === filters.age_group!.toLowerCase(),
    );
  }

  if (filters.country_id) {
    filtered = filtered.filter(
      (p) => p.country_id.toLowerCase() === filters.country_id!.toLowerCase(),
    );
  }

  if (filters.min_age !== undefined) {
    filtered = filtered.filter((p) => p.age >= filters.min_age!);
  }

  if (filters.max_age !== undefined) {
    filtered = filtered.filter((p) => p.age <= filters.max_age!);
  }

  if (filters.min_gender_probability !== undefined) {
    filtered = filtered.filter(
      (p) => p.gender_probability >= filters.min_gender_probability!,
    );
  }

  if (filters.min_country_probability !== undefined) {
    filtered = filtered.filter(
      (p) => p.country_probability >= filters.min_country_probability!,
    );
  }

  return filtered;
}

export function applySorting(
  profiles: Profile[],
  sortBy: string,
  order: "asc" | "desc",
): Profile[] {
  const sorted = [...profiles];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "age":
        comparison = a.age - b.age;
        break;
      case "created_at":
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "gender_probability":
        comparison = a.gender_probability - b.gender_probability;
        break;
      default:
        comparison = 0;
    }

    return order === "asc" ? comparison : -comparison;
  });

  return sorted;
}

export function applyPagination(
  profiles: Profile[],
  page: number,
  limit: number,
): Profile[] {
  const startIndex = (page - 1) * limit;
  return profiles.slice(startIndex, startIndex + limit);
}
