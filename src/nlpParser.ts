// src/nlpParser.ts
import { FilterOptions } from "./types.js";

interface ParsedQuery {
  filters: Partial<FilterOptions>;
  isValid: boolean;
  error?: string;
}

// Age range mappings
const AGE_RANGES: { [key: string]: { min: number; max: number } } = {
  young: { min: 16, max: 24 },
  old: { min: 60, max: 120 },
  middle: { min: 40, max: 59 },
};

// Gender mappings
const GENDER_MAPPINGS: { [key: string]: string } = {
  male: "male",
  males: "male",
  man: "male",
  men: "male",
  boy: "male",
  boys: "male",
  female: "female",
  females: "female",
  woman: "female",
  women: "female",
  girl: "female",
  girls: "female",
};

// Age group mappings
const AGE_GROUP_MAPPINGS: { [key: string]: string } = {
  child: "child",
  children: "child",
  kid: "child",
  kids: "child",
  teenager: "teenager",
  teenagers: "teenager",
  teen: "teenager",
  teens: "teenager",
  adolescent: "teenager",
  adolescents: "teenager",
  adult: "adult",
  adults: "adult",
  senior: "senior",
  seniors: "senior",
  elderly: "senior",
  aged: "senior",
};

// Country mappings (common names to ISO codes)
const COUNTRY_MAPPINGS: { [key: string]: string } = {
  nigeria: "NG",
  nigerian: "NG",
  naija: "NG",
  benin: "BJ",
  beninese: "BJ",
  ghana: "GH",
  ghanaian: "GH",
  ivorycoast: "CI",
  "cote d'ivoire": "CI",
  senegal: "SN",
  senegalese: "SN",
  cameroon: "CM",
  cameroonian: "CM",
  kenya: "KE",
  kenyan: "KE",
  "south africa": "ZA",
  southafrican: "ZA",
  angola: "AO",
  angolan: "AO",
  mali: "ML",
  malian: "ML",
  ethiopia: "ET",
  ethiopian: "ET",
  uganda: "UG",
  ugandan: "UG",
  tanzania: "TZ",
  tanzanian: "TZ",
  rwanda: "RW",
  rwandan: "RW",
  zambia: "ZM",
  zambian: "ZM",
  zimbabwe: "ZW",
  zimbabwean: "ZW",
  mozambique: "MZ",
  mozambican: "MZ",
  congo: "CD",
  congolese: "CD",
  algeria: "DZ",
  algerian: "DZ",
  morocco: "MA",
  moroccan: "MA",
  egypt: "EG",
  egyptian: "EG",
  tunisia: "TN",
  tunisian: "TN",
  libya: "LY",
  libyan: "LY",
  sudan: "SD",
  sudanese: "SD",
  somalia: "SO",
  somali: "SO",
};

// Preposition mappings for queries
const PREPOSITIONS = [
  "from",
  "in",
  "of",
  "above",
  "below",
  "over",
  "under",
  "and",
  "&",
  "plus",
];

export function parseNaturalLanguage(query: string): ParsedQuery {
  if (!query || query.trim().length === 0) {
    return { filters: {}, isValid: false, error: "Empty query" };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const words = normalizedQuery.split(/\s+/);

  const filters: Partial<FilterOptions> = {};

  // Track what we've found
  let foundGender = false;
  let foundAgeGroup = false;
  let foundCountry = false;
  let hasAgeRange = false;

  // First pass: Look for country
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Check if word is a country or followed by "from/in"
    if (COUNTRY_MAPPINGS[word]) {
      filters.country_id = COUNTRY_MAPPINGS[word];
      foundCountry = true;
      break;
    }

    // Handle "from X" or "in X" patterns
    if ((word === "from" || word === "in") && i + 1 < words.length) {
      const potentialCountry = words[i + 1];
      if (COUNTRY_MAPPINGS[potentialCountry]) {
        filters.country_id = COUNTRY_MAPPINGS[potentialCountry];
        foundCountry = true;
        break;
      }
    }
  }

  // Second pass: Look for gender
  for (const word of words) {
    if (GENDER_MAPPINGS[word]) {
      filters.gender = GENDER_MAPPINGS[word];
      foundGender = true;
      break;
    }
  }

  // Third pass: Look for age groups and age ranges
  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check for age group
    if (AGE_GROUP_MAPPINGS[word]) {
      filters.age_group = AGE_GROUP_MAPPINGS[word];
      foundAgeGroup = true;
    }

    // Handle "young" - special case for age range
    if (word === "young") {
      filters.min_age = AGE_RANGES.young.min;
      filters.max_age = AGE_RANGES.young.max;
      hasAgeRange = true;
    }

    if (word === "old" && !hasAgeRange) {
      filters.min_age = AGE_RANGES.old.min;
      filters.max_age = AGE_RANGES.old.max;
      hasAgeRange = true;
    }

    // Handle "above X" or "over X"
    if ((word === "above" || word === "over") && i + 1 < words.length) {
      const ageNum = parseInt(words[i + 1]);
      if (!isNaN(ageNum)) {
        filters.min_age = ageNum;
        hasAgeRange = true;
      }
    }

    // Handle "below X" or "under X"
    if ((word === "below" || word === "under") && i + 1 < words.length) {
      const ageNum = parseInt(words[i + 1]);
      if (!isNaN(ageNum)) {
        filters.max_age = ageNum;
        hasAgeRange = true;
      }
    }

    // Handle "teenagers above X" - special case
    if (
      word === "teenagers" &&
      i + 2 < words.length &&
      words[i + 1] === "above"
    ) {
      const ageNum = parseInt(words[i + 2]);
      if (!isNaN(ageNum)) {
        filters.age_group = "teenager";
        filters.min_age = ageNum;
        foundAgeGroup = true;
        hasAgeRange = true;
      }
    }
  }

  // Handle "male and female" or similar combinations
  if (
    normalizedQuery.includes("male and female") ||
    normalizedQuery.includes("male & female") ||
    normalizedQuery.includes("both genders")
  ) {
    // For both genders, we don't filter by gender
    delete filters.gender;
    foundGender = false;
  }

  // If we have age range but not age group, don't set age_group
  // If we found valid filters, return them
  if (foundGender || foundAgeGroup || foundCountry || hasAgeRange) {
    return { filters, isValid: true };
  }

  return { filters: {}, isValid: false, error: "Unable to interpret query" };
}
