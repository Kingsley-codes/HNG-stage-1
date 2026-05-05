import {
  FilterOptions,
  Profile,
  QueryExecutionOptions,
  QueryExecutionResult,
} from "../types/index.js";
import {
  buildQueryCacheKey,
  normalizeFilters,
  normalizeQueryOptions,
  NormalizedFilters,
} from "./queryNormalization.js";

interface CacheEntry {
  expiresAt: number;
  value: QueryExecutionResult;
}

class QueryResultCache {
  private entries = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): QueryExecutionResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: QueryExecutionResult): void {
    this.entries.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      value,
    });

    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;
    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export class ProfileQueryEngine {
  private profiles = new Map<string, Profile>();
  private nameIndex = new Map<string, string>();
  private genderIndex = new Map<string, Set<string>>();
  private ageGroupIndex = new Map<string, Set<string>>();
  private countryIndex = new Map<string, Set<string>>();
  private ageBuckets = new Map<number, string[]>();
  private createdAtOrder: string[] = [];
  private readonly cache = new QueryResultCache(250, 30_000);

  hydrate(profiles: Iterable<Profile>): void {
    this.clear();
    const loadedProfiles = Array.from(profiles);

    for (const profile of loadedProfiles) {
      this.profiles.set(profile.id, profile);
      this.nameIndex.set(profile.name.toLowerCase(), profile.id);
      this.addIndexValue(this.genderIndex, profile.gender.toLowerCase(), profile.id);
      this.addIndexValue(
        this.ageGroupIndex,
        profile.age_group.toLowerCase(),
        profile.id,
      );
      this.addIndexValue(
        this.countryIndex,
        profile.country_id.toUpperCase(),
        profile.id,
      );
      this.addAgeBucket(profile.age, profile.id);
    }

    this.createdAtOrder = loadedProfiles
      .slice()
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      )
      .map((profile) => profile.id);
  }

  clear(): void {
    this.profiles.clear();
    this.nameIndex.clear();
    this.genderIndex.clear();
    this.ageGroupIndex.clear();
    this.countryIndex.clear();
    this.ageBuckets.clear();
    this.createdAtOrder = [];
    this.cache.clear();
  }

  addProfile(profile: Profile): void {
    this.addProfiles([profile]);
  }

  addProfiles(profiles: Profile[]): void {
    if (profiles.length === 0) {
      return;
    }

    const newIds: string[] = [];

    for (const profile of profiles) {
      this.profiles.set(profile.id, profile);
      this.nameIndex.set(profile.name.toLowerCase(), profile.id);
      this.addIndexValue(this.genderIndex, profile.gender.toLowerCase(), profile.id);
      this.addIndexValue(
        this.ageGroupIndex,
        profile.age_group.toLowerCase(),
        profile.id,
      );
      this.addIndexValue(
        this.countryIndex,
        profile.country_id.toUpperCase(),
        profile.id,
      );
      this.addAgeBucket(profile.age, profile.id);
      newIds.push(profile.id);
    }

    this.createdAtOrder = mergeCreatedAtOrder(
      this.createdAtOrder,
      newIds,
      this.profiles,
    );
    this.cache.clear();
  }

  deleteProfile(id: string): Profile | undefined {
    const profile = this.profiles.get(id);
    if (!profile) {
      return undefined;
    }

    this.profiles.delete(id);
    this.nameIndex.delete(profile.name.toLowerCase());
    this.deleteIndexValue(this.genderIndex, profile.gender.toLowerCase(), id);
    this.deleteIndexValue(this.ageGroupIndex, profile.age_group.toLowerCase(), id);
    this.deleteIndexValue(this.countryIndex, profile.country_id.toUpperCase(), id);
    this.deleteAgeBucket(profile.age, id);
    this.createdAtOrder = this.createdAtOrder.filter((profileId) => profileId !== id);
    this.cache.clear();
    return profile;
  }

  getProfile(id: string): Profile | undefined {
    return this.profiles.get(id);
  }

  getProfileByName(name: string): Profile | undefined {
    const id = this.nameIndex.get(name.toLowerCase());
    return id ? this.profiles.get(id) : undefined;
  }

  hasProfileName(name: string): boolean {
    return this.nameIndex.has(name.toLowerCase());
  }

  getAllProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  getProfileCount(): number {
    return this.profiles.size;
  }

  getProfilesSnapshot(): Record<string, Profile> {
    return Object.fromEntries(this.profiles);
  }

  getNameIndexSnapshot(): Record<string, string> {
    return Object.fromEntries(this.nameIndex);
  }

  queryProfiles(
    filters: Partial<FilterOptions>,
    options: Partial<QueryExecutionOptions>,
    scope = "profiles:list",
  ): QueryExecutionResult {
    const cacheKey = buildQueryCacheKey(scope, filters, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const normalizedFilters = normalizeFilters(filters);
    const normalizedOptions = normalizeQueryOptions(options);
    const result = this.executeQuery(normalizedFilters, normalizedOptions);

    this.cache.set(cacheKey, result);
    return result;
  }

  exportProfiles(
    filters: Partial<FilterOptions>,
    options: Partial<QueryExecutionOptions>,
  ): Profile[] {
    const normalizedFilters = normalizeFilters(filters);
    const normalizedOptions = normalizeQueryOptions(options);

    if (normalizedOptions.sort_by === "created_at") {
      return this.collectCreatedAtOrderedProfiles(
        this.buildCandidateIds(normalizedFilters),
        normalizedFilters,
        normalizedOptions.order,
      );
    }

    if (normalizedOptions.sort_by === "age") {
      return this.collectAgeOrderedProfiles(
        this.buildCandidateIds(normalizedFilters),
        normalizedFilters,
        normalizedOptions.order,
      );
    }

    return this.collectProbabilityOrderedProfiles(
      this.buildCandidateIds(normalizedFilters),
      normalizedFilters,
      normalizedOptions.order,
    );
  }

  private executeQuery(
    filters: NormalizedFilters,
    options: QueryExecutionOptions,
  ): QueryExecutionResult {
    if (options.sort_by === "created_at") {
      return this.paginateCreatedAtOrderedProfiles(filters, options);
    }

    if (options.sort_by === "age") {
      return this.paginateAgeOrderedProfiles(filters, options);
    }

    return this.paginateProbabilityOrderedProfiles(filters, options);
  }

  private paginateCreatedAtOrderedProfiles(
    filters: NormalizedFilters,
    options: QueryExecutionOptions,
  ): QueryExecutionResult {
    const candidateIds = this.buildCandidateIds(filters);

    if (!candidateIds && !hasProbabilityFilters(filters)) {
      return this.sliceCreatedAtOnly(options);
    }

    if (this.shouldSortCandidates(candidateIds)) {
      const ordered = this.collectSortedCandidateProfiles(
        candidateIds!,
        filters,
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
        options.order,
      );
      return paginateProfiles(ordered, options);
    }

    const ordered = this.collectCreatedAtOrderedProfiles(
      candidateIds,
      filters,
      options.order,
    );
    return paginateProfiles(ordered, options);
  }

  private paginateAgeOrderedProfiles(
    filters: NormalizedFilters,
    options: QueryExecutionOptions,
  ): QueryExecutionResult {
    const candidateIds = this.buildCandidateIds(filters);

    if (this.shouldSortCandidates(candidateIds)) {
      const ordered = this.collectSortedCandidateProfiles(
        candidateIds!,
        filters,
        (left, right) => left.age - right.age,
        options.order,
      );
      return paginateProfiles(ordered, options);
    }

    const ordered = this.collectAgeOrderedProfiles(candidateIds, filters, options.order);
    return paginateProfiles(ordered, options);
  }

  private paginateProbabilityOrderedProfiles(
    filters: NormalizedFilters,
    options: QueryExecutionOptions,
  ): QueryExecutionResult {
    const ordered = this.collectProbabilityOrderedProfiles(
      this.buildCandidateIds(filters),
      filters,
      options.order,
    );
    return paginateProfiles(ordered, options);
  }

  private sliceCreatedAtOnly(options: QueryExecutionOptions): QueryExecutionResult {
    const total = this.createdAtOrder.length;
    const start = (options.page - 1) * options.limit;
    const end = start + options.limit;
    const orderedIds =
      options.order === "asc"
        ? this.createdAtOrder.slice(start, end)
        : this.createdAtOrder
            .slice(Math.max(0, total - end), total - start)
            .reverse();

    return {
      page: options.page,
      limit: options.limit,
      total,
      total_pages: Math.ceil(total / options.limit),
      data: orderedIds
        .map((id) => this.profiles.get(id))
        .filter((profile): profile is Profile => Boolean(profile)),
    };
  }

  private collectCreatedAtOrderedProfiles(
    candidateIds: Set<string> | null,
    filters: NormalizedFilters,
    order: "asc" | "desc",
  ): Profile[] {
    const orderedIds =
      order === "asc" ? this.createdAtOrder : [...this.createdAtOrder].reverse();
    const profiles: Profile[] = [];

    for (const id of orderedIds) {
      if (candidateIds && !candidateIds.has(id)) {
        continue;
      }

      const profile = this.profiles.get(id);
      if (!profile || !matchesPostIndexFilters(profile, filters)) {
        continue;
      }

      profiles.push(profile);
    }

    return profiles;
  }

  private collectAgeOrderedProfiles(
    candidateIds: Set<string> | null,
    filters: NormalizedFilters,
    order: "asc" | "desc",
  ): Profile[] {
    const ages = Array.from(this.ageBuckets.keys()).sort((left, right) =>
      order === "asc" ? left - right : right - left,
    );
    const profiles: Profile[] = [];

    for (const age of ages) {
      const bucket = this.ageBuckets.get(age) ?? [];
      for (const id of bucket) {
        if (candidateIds && !candidateIds.has(id)) {
          continue;
        }

        const profile = this.profiles.get(id);
        if (!profile || !matchesPostIndexFilters(profile, filters)) {
          continue;
        }

        profiles.push(profile);
      }
    }

    return profiles;
  }

  private collectProbabilityOrderedProfiles(
    candidateIds: Set<string> | null,
    filters: NormalizedFilters,
    order: "asc" | "desc",
  ): Profile[] {
    const profiles = candidateIds
      ? Array.from(candidateIds)
          .map((id) => this.profiles.get(id))
          .filter((profile): profile is Profile => Boolean(profile))
      : this.getAllProfiles();

    const filtered = profiles.filter((profile) =>
      matchesPostIndexFilters(profile, filters),
    );

    filtered.sort((left, right) => {
      const comparison = left.gender_probability - right.gender_probability;
      return order === "asc" ? comparison : -comparison;
    });

    return filtered;
  }

  private collectSortedCandidateProfiles(
    candidateIds: Set<string>,
    filters: NormalizedFilters,
    comparator: (left: Profile, right: Profile) => number,
    order: "asc" | "desc",
  ): Profile[] {
    const filtered = Array.from(candidateIds)
      .map((id) => this.profiles.get(id))
      .filter((profile): profile is Profile => Boolean(profile))
      .filter((profile) => matchesPostIndexFilters(profile, filters));

    filtered.sort((left, right) => {
      const comparison = comparator(left, right);
      return order === "asc" ? comparison : -comparison;
    });

    return filtered;
  }

  private buildCandidateIds(filters: NormalizedFilters): Set<string> | null {
    const indexedSets: Set<string>[] = [];

    if (filters.gender) {
      indexedSets.push(new Set(this.genderIndex.get(filters.gender) ?? []));
    }

    if (filters.age_group) {
      indexedSets.push(new Set(this.ageGroupIndex.get(filters.age_group) ?? []));
    }

    if (filters.country_id) {
      indexedSets.push(new Set(this.countryIndex.get(filters.country_id) ?? []));
    }

    if (indexedSets.length === 0) {
      if (filters.min_age !== undefined || filters.max_age !== undefined) {
        return this.collectAgeRangeIds(filters.min_age, filters.max_age);
      }

      return null;
    }

    indexedSets.sort((left, right) => left.size - right.size);
    let intersection = indexedSets[0] ?? new Set<string>();

    for (let index = 1; index < indexedSets.length; index++) {
      const next = indexedSets[index]!;
      intersection = intersectSets(intersection, next);

      if (intersection.size === 0) {
        return intersection;
      }
    }

    return intersection;
  }

  private collectAgeRangeIds(
    minAge: number | undefined,
    maxAge: number | undefined,
  ): Set<string> {
    const lowerBound = minAge ?? 0;
    const upperBound = maxAge ?? 120;
    const ids = new Set<string>();

    for (let age = lowerBound; age <= upperBound; age++) {
      const bucket = this.ageBuckets.get(age);
      if (!bucket) {
        continue;
      }

      for (const id of bucket) {
        ids.add(id);
      }
    }

    return ids;
  }

  private shouldSortCandidates(candidateIds: Set<string> | null): boolean {
    return Boolean(
      candidateIds &&
        candidateIds.size > 0 &&
        candidateIds.size <= Math.max(1_000, this.profiles.size / 3),
    );
  }

  private addIndexValue(
    index: Map<string, Set<string>>,
    key: string,
    id: string,
  ): void {
    const existing = index.get(key);
    if (existing) {
      existing.add(id);
      return;
    }

    index.set(key, new Set([id]));
  }

  private deleteIndexValue(
    index: Map<string, Set<string>>,
    key: string,
    id: string,
  ): void {
    const existing = index.get(key);
    if (!existing) {
      return;
    }

    existing.delete(id);
    if (existing.size === 0) {
      index.delete(key);
    }
  }

  private addAgeBucket(age: number, id: string): void {
    const bucket = this.ageBuckets.get(age);
    if (bucket) {
      bucket.push(id);
      return;
    }

    this.ageBuckets.set(age, [id]);
  }

  private deleteAgeBucket(age: number, id: string): void {
    const bucket = this.ageBuckets.get(age);
    if (!bucket) {
      return;
    }

    const nextBucket = bucket.filter((profileId) => profileId !== id);
    if (nextBucket.length === 0) {
      this.ageBuckets.delete(age);
      return;
    }

    this.ageBuckets.set(age, nextBucket);
  }
}

function hasProbabilityFilters(filters: NormalizedFilters): boolean {
  return (
    filters.min_gender_probability !== undefined ||
    filters.min_country_probability !== undefined
  );
}

function matchesPostIndexFilters(
  profile: Profile,
  filters: NormalizedFilters,
): boolean {
  if (filters.min_age !== undefined && profile.age < filters.min_age) {
    return false;
  }

  if (filters.max_age !== undefined && profile.age > filters.max_age) {
    return false;
  }

  if (
    filters.min_gender_probability !== undefined &&
    profile.gender_probability < filters.min_gender_probability
  ) {
    return false;
  }

  if (
    filters.min_country_probability !== undefined &&
    profile.country_probability < filters.min_country_probability
  ) {
    return false;
  }

  return true;
}

function paginateProfiles(
  profiles: Profile[],
  options: QueryExecutionOptions,
): QueryExecutionResult {
  const total = profiles.length;
  const start = (options.page - 1) * options.limit;

  return {
    page: options.page,
    limit: options.limit,
    total,
    total_pages: Math.ceil(total / options.limit),
    data: profiles.slice(start, start + options.limit),
  };
}

function intersectSets(left: Set<string>, right: Set<string>): Set<string> {
  const result = new Set<string>();
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];

  for (const value of smaller) {
    if (larger.has(value)) {
      result.add(value);
    }
  }

  return result;
}

function mergeCreatedAtOrder(
  existingIds: string[],
  newIds: string[],
  profiles: Map<string, Profile>,
): string[] {
  const sortedNewIds = newIds
    .slice()
    .sort(
      (leftId, rightId) =>
        new Date(profiles.get(leftId)!.created_at).getTime() -
        new Date(profiles.get(rightId)!.created_at).getTime(),
    );

  const merged: string[] = [];
  let existingIndex = 0;
  let newIndex = 0;

  while (existingIndex < existingIds.length && newIndex < sortedNewIds.length) {
    const existingId = existingIds[existingIndex]!;
    const newId = sortedNewIds[newIndex]!;
    const existingTimestamp = new Date(
      profiles.get(existingId)!.created_at,
    ).getTime();
    const newTimestamp = new Date(profiles.get(newId)!.created_at).getTime();

    if (existingTimestamp <= newTimestamp) {
      merged.push(existingId);
      existingIndex++;
    } else {
      merged.push(newId);
      newIndex++;
    }
  }

  while (existingIndex < existingIds.length) {
    merged.push(existingIds[existingIndex]!);
    existingIndex++;
  }

  while (newIndex < sortedNewIds.length) {
    merged.push(sortedNewIds[newIndex]!);
    newIndex++;
  }

  return merged;
}
