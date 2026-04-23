// src/nlpParser.ts - Complete rewrite
import { FilterOptions } from "./types.js";

interface ParsedQuery {
  filters: Partial<FilterOptions>;
  isValid: boolean;
  error?: string;
}

const AGE_RANGES = {
  young: { min: 16, max: 24 },
};

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

const AGE_GROUP_MAPPINGS: { [key: string]: string } = {
  child: "child",
  children: "child",
  kid: "child",
  kids: "child",
  teenager: "teenager",
  teenagers: "teenager",
  teen: "teenager",
  teens: "teenager",
  adult: "adult",
  adults: "adult",
  senior: "senior",
  seniors: "senior",
  elderly: "senior",
  aged: "senior",
};

const COUNTRY_MAPPINGS: { [key: string]: string } = {
  nigeria: "NG",
  nigerian: "NG",
  naija: "NG",
  kenya: "KE",
  kenyan: "KE",
  "south africa": "ZA",
  southafrica: "ZA",
  angola: "AO",
  angolan: "AO",
  ghana: "GH",
  ghanaian: "GH",
  senegal: "SN",
  senegalese: "SN",
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
  sudan: "SD",
  sudanese: "SD",
  somalia: "SO",
  somali: "SO",
  malawi: "MW",
  malawian: "MW",
  botswana: "BW",
  batswana: "BW",
  namibia: "NA",
  namibian: "NA",
  lesotho: "LS",
  basotho: "LS",
  eswatini: "SZ",
  swazi: "SZ",
};

export function parseNaturalLanguage(query: string): ParsedQuery {
  if (!query || query.trim().length === 0) {
    return { filters: {}, isValid: false, error: "Empty query" };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const filters: Partial<FilterOptions> = {};

  // Extract gender
  for (const [word, gender] of Object.entries(GENDER_MAPPINGS)) {
    if (normalizedQuery.includes(word)) {
      filters.gender = gender;
      break;
    }
  }

  // Extract age group
  for (const [word, ageGroup] of Object.entries(AGE_GROUP_MAPPINGS)) {
    if (normalizedQuery.includes(word)) {
      filters.age_group = ageGroup;
      break;
    }
  }

  // Extract country
  for (const [word, countryId] of Object.entries(COUNTRY_MAPPINGS)) {
    if (normalizedQuery.includes(word)) {
      filters.country_id = countryId;
      break;
    }
  }

  // Handle "young" age range
  if (normalizedQuery.includes("young")) {
    filters.min_age = AGE_RANGES.young.min;
    filters.max_age = AGE_RANGES.young.max;
  }

  // Handle age comparisons (above X, over X, below X, under X)
  const aboveMatch = normalizedQuery.match(/(?:above|over)\s+(\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1]);
  }

  const belowMatch = normalizedQuery.match(/(?:below|under)\s+(\d+)/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1]);
  }

  // Handle "male and female" or "both genders" - remove gender filter
  if (
    normalizedQuery.includes("male and female") ||
    normalizedQuery.includes("male & female") ||
    normalizedQuery.includes("both genders")
  ) {
    delete filters.gender;
  }

  // Check if we found any valid filters
  if (Object.keys(filters).length > 0) {
    return { filters, isValid: true };
  }

  return { filters: {}, isValid: false, error: "Unable to interpret query" };
}
