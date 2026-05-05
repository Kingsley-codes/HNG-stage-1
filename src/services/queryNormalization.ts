import { FilterOptions, QueryExecutionOptions } from "../types/index.js";

export type NormalizedFilters = Partial<
  Omit<FilterOptions, "sort_by" | "order" | "page" | "limit">
>;

const AGE_GROUP_RANGES: Record<string, { min?: number; max?: number }> = {
  child: { min: 0, max: 12 },
  teenager: { min: 13, max: 19 },
  adult: { min: 20, max: 59 },
  senior: { min: 60 },
};

export function normalizeFilters(
  filters: Partial<FilterOptions>,
): NormalizedFilters {
  const normalized: NormalizedFilters = {};

  if (typeof filters.gender === "string") {
    const gender = filters.gender.trim().toLowerCase();
    if (gender) {
      normalized.gender = gender;
    }
  }

  if (typeof filters.age_group === "string") {
    const ageGroup = filters.age_group.trim().toLowerCase();
    if (ageGroup) {
      normalized.age_group = ageGroup;
    }
  }

  if (typeof filters.country_id === "string") {
    const countryId = filters.country_id.trim().toUpperCase();
    if (countryId) {
      normalized.country_id = countryId;
    }
  }

  if (Number.isFinite(filters.min_age)) {
    normalized.min_age = Math.max(0, Math.trunc(filters.min_age!));
  }

  if (Number.isFinite(filters.max_age)) {
    normalized.max_age = Math.max(0, Math.trunc(filters.max_age!));
  }

  if (
    normalized.min_age !== undefined &&
    normalized.max_age !== undefined &&
    normalized.min_age > normalized.max_age
  ) {
    [normalized.min_age, normalized.max_age] = [
      normalized.max_age,
      normalized.min_age,
    ];
  }

  if (Number.isFinite(filters.min_gender_probability)) {
    normalized.min_gender_probability = clampProbability(
      filters.min_gender_probability!,
    );
  }

  if (Number.isFinite(filters.min_country_probability)) {
    normalized.min_country_probability = clampProbability(
      filters.min_country_probability!,
    );
  }

  collapseRedundantAgeFilters(normalized);

  return normalized;
}

export function normalizeQueryOptions(
  options: Partial<QueryExecutionOptions>,
): QueryExecutionOptions {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 10)));

  return {
    page,
    limit,
    sort_by: normalizeSortBy(options.sort_by),
    order: options.order === "desc" ? "desc" : "asc",
  };
}

export function buildQueryCacheKey(
  scope: string,
  filters: Partial<FilterOptions>,
  options: Partial<QueryExecutionOptions>,
): string {
  return JSON.stringify({
    scope,
    filters: normalizeFilters(filters),
    options: normalizeQueryOptions(options),
  });
}

function collapseRedundantAgeFilters(filters: NormalizedFilters): void {
  if (!filters.age_group) {
    return;
  }

  const groupRange = AGE_GROUP_RANGES[filters.age_group];
  if (!groupRange) {
    return;
  }

  const { min_age: minAge, max_age: maxAge } = filters;

  if (
    minAge !== undefined &&
    maxAge !== undefined &&
    groupRange.min !== undefined &&
    groupRange.max !== undefined &&
    minAge === groupRange.min &&
    maxAge === groupRange.max
  ) {
    delete filters.min_age;
    delete filters.max_age;
    return;
  }

  if (
    minAge !== undefined &&
    maxAge !== undefined &&
    groupRange.min !== undefined &&
    minAge >= groupRange.min &&
    (groupRange.max === undefined || maxAge <= groupRange.max)
  ) {
    delete filters.age_group;
    return;
  }

  if (
    filters.age_group === "senior" &&
    minAge !== undefined &&
    minAge >= 60 &&
    maxAge === undefined
  ) {
    delete filters.min_age;
  }
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeSortBy(
  value: QueryExecutionOptions["sort_by"] | undefined,
): QueryExecutionOptions["sort_by"] {
  if (value === "age" || value === "gender_probability") {
    return value;
  }

  return "created_at";
}
