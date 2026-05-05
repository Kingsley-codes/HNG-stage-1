import { FilterOptions } from "../types/index.js";
import { normalizeFilters } from "./queryNormalization.js";

interface ParsedQuery {
  filters: Partial<FilterOptions>;
  isValid: boolean;
  error?: string;
}

const COUNTRY_ALIASES: Array<{ pattern: RegExp; countryId: string }> = [
  { pattern: /\bnigerian?\b|\bnigeria\b/, countryId: "NG" },
  { pattern: /\bkenyan?\b|\bkenya\b/, countryId: "KE" },
  { pattern: /\bghanaian\b|\bghana\b/, countryId: "GH" },
  { pattern: /\bangolan\b|\bangola\b/, countryId: "AO" },
  { pattern: /\bsouth african\b|\bsouth africa\b/, countryId: "ZA" },
  { pattern: /\bbenin(?:ese)?\b|\bbenin\b/, countryId: "BJ" },
  { pattern: /\bcameroonian\b|\bcameroon\b/, countryId: "CM" },
  { pattern: /\bsenegalese\b|\bsenegal\b/, countryId: "SN" },
];

export function parseNaturalLanguage(query: string): ParsedQuery {
  if (!query || query.trim().length === 0) {
    return { filters: {}, isValid: false, error: "Empty query" };
  }

  const normalizedQuery = normalizeQueryText(query);
  const filters: Partial<FilterOptions> = {};

  const gender = parseGender(normalizedQuery);
  if (gender) {
    filters.gender = gender;
  }

  const countryId = parseCountry(normalizedQuery);
  if (countryId) {
    filters.country_id = countryId;
  }

  const ageRange = parseAgeRange(normalizedQuery);
  if (ageRange.min_age !== undefined) {
    filters.min_age = ageRange.min_age;
  }

  if (ageRange.max_age !== undefined) {
    filters.max_age = ageRange.max_age;
  }

  const ageGroup = parseAgeGroup(normalizedQuery);
  if (ageGroup) {
    filters.age_group = ageGroup;
  }

  if (
    normalizedQuery.includes("young") &&
    filters.min_age === undefined &&
    filters.max_age === undefined &&
    !filters.age_group
  ) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  const normalizedFilters = normalizeFilters(filters);

  if (Object.keys(normalizedFilters).length === 0) {
    return { filters: {}, isValid: false, error: "Unable to interpret query" };
  }

  return { filters: normalizedFilters, isValid: true };
}

function normalizeQueryText(query: string): string {
  return query
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGender(query: string): string | undefined {
  if (/\b(?:male and female|female and male|both genders?|all genders?)\b/.test(query)) {
    return undefined;
  }

  if (/\b(?:women|woman|female|females|girl|girls)\b/.test(query)) {
    return "female";
  }

  if (/\b(?:men|man|male|males|boy|boys)\b/.test(query)) {
    return "male";
  }

  return undefined;
}

function parseCountry(query: string): string | undefined {
  for (const alias of COUNTRY_ALIASES) {
    if (alias.pattern.test(query)) {
      return alias.countryId;
    }
  }

  return undefined;
}

function parseAgeGroup(query: string): string | undefined {
  if (/\b(?:children|child|kids?)\b/.test(query)) {
    return "child";
  }

  if (/\b(?:teenagers?|teens?)\b/.test(query)) {
    return "teenager";
  }

  if (/\b(?:adults?)\b/.test(query)) {
    return "adult";
  }

  if (/\b(?:seniors?|elderly|older adults?)\b/.test(query)) {
    return "senior";
  }

  return undefined;
}

function parseAgeRange(query: string): Partial<FilterOptions> {
  const betweenMatch = query.match(
    /\b(?:between(?: ages?)?|aged?|age)\s+(\d{1,3})\s*(?:and|to|-)\s*(\d{1,3})\b/,
  );
  if (betweenMatch) {
    const firstAge = Number.parseInt(betweenMatch[1]!, 10);
    const secondAge = Number.parseInt(betweenMatch[2]!, 10);
    return {
      min_age: Math.min(firstAge, secondAge),
      max_age: Math.max(firstAge, secondAge),
    };
  }

  const inclusiveMinMatch = query.match(
    /\b(?:at least|minimum|min\.?|from)\s+(\d{1,3})\b/,
  );
  if (inclusiveMinMatch) {
    return { min_age: Number.parseInt(inclusiveMinMatch[1]!, 10) };
  }

  const strictMinMatch = query.match(/\b(?:above|over|older than)\s+(\d{1,3})\b/);
  if (strictMinMatch) {
    return { min_age: Number.parseInt(strictMinMatch[1]!, 10) + 1 };
  }

  const inclusiveMaxMatch = query.match(/\b(?:at most|maximum|max\.?)\s+(\d{1,3})\b/);
  if (inclusiveMaxMatch) {
    return { max_age: Number.parseInt(inclusiveMaxMatch[1]!, 10) };
  }

  const strictMaxMatch = query.match(/\b(?:below|under|younger than)\s+(\d{1,3})\b/);
  if (strictMaxMatch) {
    return { max_age: Math.max(0, Number.parseInt(strictMaxMatch[1]!, 10) - 1) };
  }

  return {};
}
