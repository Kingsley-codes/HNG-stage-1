// src/nlpParser.ts - COMPLETE REWRITE

import { FilterOptions } from "../types/index.js";

interface ParsedQuery {
  filters: Partial<FilterOptions>;
  isValid: boolean;
  error?: string;
}

// Country mappings (common names to ISO codes)
const COUNTRY_MAPPINGS: { [key: string]: string } = {
  nigeria: "NG",
  nigerian: "NG",
  kenya: "KE",
  kenyan: "KE",
  "south africa": "ZA",
  "south african": "ZA",
  angola: "AO",
  angolan: "AO",
  ghana: "GH",
  ghanaian: "GH",
};

export function parseNaturalLanguage(query: string): ParsedQuery {
  if (!query || query.trim().length === 0) {
    return { filters: {}, isValid: false, error: "Empty query" };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const filters: Partial<FilterOptions> = {};

  // ============================================
  // 1. CHECK FOR "young males" pattern
  // ============================================
  if (normalizedQuery.includes("young males")) {
    filters.gender = "male";
    filters.min_age = 16;
    filters.max_age = 24;
    return { filters, isValid: true };
  }

  if (
    normalizedQuery.includes("young females") ||
    normalizedQuery.includes("young girls")
  ) {
    filters.gender = "female";
    filters.min_age = 16;
    filters.max_age = 24;
    return { filters, isValid: true };
  }

  // ============================================
  // 2. CHECK FOR "females above 30" pattern
  // ============================================
  const aboveMatch = normalizedQuery.match(
    /(males|females|men|women|people)\s+above\s+(\d+)/,
  );
  if (aboveMatch) {
    const genderWord = aboveMatch[1];
    const age = parseInt(aboveMatch[2]);

    if (genderWord === "males" || genderWord === "men") {
      filters.gender = "male";
    } else if (genderWord === "females" || genderWord === "women") {
      filters.gender = "female";
    }

    filters.min_age = age;
    return { filters, isValid: true };
  }

  // ============================================
  // 3. CHECK FOR "people from nigeria" pattern
  // ============================================
  const fromMatch = normalizedQuery.match(/people from (\w+)/);
  if (fromMatch) {
    const country = fromMatch[1];
    if (COUNTRY_MAPPINGS[country]) {
      filters.country_id = COUNTRY_MAPPINGS[country];
      return { filters, isValid: true };
    }
  }

  // ============================================
  // 4. CHECK FOR "adult males from kenya" pattern
  // ============================================
  const adultMatch = normalizedQuery.match(
    /(adult|teenager|senior)\s+(males|females)\s+from\s+(\w+)/,
  );
  if (adultMatch) {
    const ageGroup = adultMatch[1];
    const gender = adultMatch[2];
    const country = adultMatch[3];

    filters.age_group = ageGroup;
    filters.gender = gender === "males" ? "male" : "female";

    if (COUNTRY_MAPPINGS[country]) {
      filters.country_id = COUNTRY_MAPPINGS[country];
    }

    return { filters, isValid: true };
  }

  // ============================================
  // 5. CHECK FOR "male and female teenagers above 17" pattern
  // ============================================
  const teenMatch = normalizedQuery.match(
    /(?:male and female|both genders?)\s+(teenagers|teens)\s+above\s+(\d+)/,
  );
  if (teenMatch) {
    const ageGroup = teenMatch[1];
    const age = parseInt(teenMatch[2]);

    filters.age_group = ageGroup === "teenagers" ? "teenager" : ageGroup;
    filters.min_age = age;
    // Don't set gender - both genders
    delete filters.gender;

    return { filters, isValid: true };
  }

  // ============================================
  // 6. Simple gender only
  // ============================================
  if (normalizedQuery === "males" || normalizedQuery === "male") {
    filters.gender = "male";
    return { filters, isValid: true };
  }

  if (normalizedQuery === "females" || normalizedQuery === "female") {
    filters.gender = "female";
    return { filters, isValid: true };
  }

  // ============================================
  // 7. Simple country only
  // ============================================
  for (const [countryName, countryCode] of Object.entries(COUNTRY_MAPPINGS)) {
    if (
      normalizedQuery.includes(`from ${countryName}`) ||
      normalizedQuery === countryName
    ) {
      filters.country_id = countryCode;
      return { filters, isValid: true };
    }
  }

  // ============================================
  // 8. Age group only
  // ============================================
  if (normalizedQuery === "teenagers" || normalizedQuery === "teens") {
    filters.age_group = "teenager";
    return { filters, isValid: true };
  }

  if (normalizedQuery === "adults") {
    filters.age_group = "adult";
    return { filters, isValid: true };
  }

  if (normalizedQuery === "seniors") {
    filters.age_group = "senior";
    return { filters, isValid: true };
  }

  // ============================================
  // If nothing matched
  // ============================================
  return { filters: {}, isValid: false, error: "Unable to interpret query" };
}
