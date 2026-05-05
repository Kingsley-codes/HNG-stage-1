import { performance } from "perf_hooks";
import { Profile } from "../types/index.js";
import { applyFilters, applyPagination, applySorting, getAgeGroup } from "../utils/helpers.js";
import { ProfileQueryEngine } from "../services/profileQueryEngine.js";

const DATASET_SIZE = Number.parseInt(process.env.BENCHMARK_SIZE ?? "200000", 10);

const queries = [
  {
    name: "Nigeria females 20-45 by created_at",
    filters: { country_id: "NG", gender: "female", min_age: 20, max_age: 45 },
    options: { page: 1, limit: 25, sort_by: "created_at" as const, order: "desc" as const },
  },
  {
    name: "Kenya adults by age",
    filters: { country_id: "KE", age_group: "adult" },
    options: { page: 2, limit: 25, sort_by: "age" as const, order: "asc" as const },
  },
  {
    name: "Repeated cacheable query",
    filters: { country_id: "NG", gender: "female", min_age: 20, max_age: 45 },
    options: { page: 1, limit: 25, sort_by: "created_at" as const, order: "desc" as const },
  },
];

const profiles = buildDataset(DATASET_SIZE);
const engine = new ProfileQueryEngine();
engine.hydrate(profiles);

console.log(`Dataset size: ${DATASET_SIZE.toLocaleString()} profiles`);
console.log("| Query | Legacy scan (ms) | Indexed miss (ms) | Cached hit (ms) |");
console.log("| --- | ---: | ---: | ---: |");

for (const query of queries) {
  const legacyMs = measure(() => legacyQuery(profiles, query.filters, query.options));
  const indexedMissMs = measure(() => engine.queryProfiles(query.filters, query.options, query.name));
  const cachedHitMs = measure(() => engine.queryProfiles(query.filters, query.options, query.name));

  console.log(
    `| ${query.name} | ${legacyMs.toFixed(2)} | ${indexedMissMs.toFixed(2)} | ${cachedHitMs.toFixed(2)} |`,
  );
}

function legacyQuery(
  dataset: Profile[],
  filters: Record<string, unknown>,
  options: {
    page: number;
    limit: number;
    sort_by: "age" | "created_at" | "gender_probability";
    order: "asc" | "desc";
  },
) {
  const filtered = applyFilters(dataset, filters);
  const sorted = applySorting(filtered, options.sort_by, options.order);
  return applyPagination(sorted, options.page, options.limit);
}

function measure(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function buildDataset(size: number): Profile[] {
  const countries = ["NG", "KE", "GH", "ZA", "AO", "SN", "CM", "BJ"];
  const genders: Array<"male" | "female"> = ["male", "female"];
  const profiles: Profile[] = [];

  for (let index = 0; index < size; index++) {
    const age = 18 + (index % 50);
    const gender = genders[index % genders.length]!;
    const countryId = countries[index % countries.length]!;
    const createdAt = new Date(
      Date.UTC(2025, 0, 1, 0, 0, 0, index % 1000),
    ).toISOString();

    profiles.push({
      id: `profile-${index}`,
      name: `User ${index}`,
      gender,
      gender_probability: 0.5 + ((index % 50) / 100),
      sample_size: 100 + (index % 500),
      age,
      age_group: getAgeGroup(age),
      country_id: countryId,
      country_name: countryId,
      country_probability: 0.4 + ((index % 60) / 100),
      created_at: createdAt,
    });
  }

  return profiles;
}
