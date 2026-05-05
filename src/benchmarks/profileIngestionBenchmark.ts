import { MongoClient, type Collection } from "mongodb";
import {
  ProfileDocument,
  toProfile,
} from "../models/profileModel.js";
import { env } from "../config/env.js";
import { Profile } from "../types/index.js";
import { ProfileQueryEngine } from "../services/profileQueryEngine.js";

const TOTAL_ROWS = Number.parseInt(
  process.env.INGESTION_BENCHMARK_ROWS ?? "100000",
  10,
);
const BATCH_SIZES = (process.env.INGESTION_BENCHMARK_BATCH_SIZES ?? "20000,50000")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value > 0);

const client = new MongoClient(env.MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 10_000,
});

const dbName = `insighta_ingest_bench_${Date.now()}`;

await client.connect();

try {
  const database = client.db(dbName);
  const collection = database.collection<ProfileDocument>("profiles");

  await collection.createIndex(
    { id: 1 },
    { unique: true, name: "profile_id_unique" },
  );
  await collection.createIndex(
    { name_key: 1 },
    { unique: true, name: "profile_name_key_unique" },
  );

  console.log(`Dataset size: ${TOTAL_ROWS.toLocaleString()} profiles`);
  console.log(
    "| Batch Size | Insert (s) | Rebuild (s) | Total (s) | Rows/sec | Projected 500k (s) |",
  );
  console.log("| ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const batchSize of BATCH_SIZES) {
    await collection.deleteMany({});
    const insertStart = performance.now();

    for (let offset = 0; offset < TOTAL_ROWS; offset += batchSize) {
      const batch = buildBatch(offset, Math.min(batchSize, TOTAL_ROWS - offset));
      await aggressiveInsert(collection, batch);
    }

    const insertSeconds = (performance.now() - insertStart) / 1000;

    const rebuildStart = performance.now();
    await rebuildReadModel(collection);
    const rebuildSeconds = (performance.now() - rebuildStart) / 1000;

    const totalSeconds = insertSeconds + rebuildSeconds;
    const rowsPerSecond = TOTAL_ROWS / totalSeconds;
    const projected500kSeconds = 500000 / rowsPerSecond;

    console.log(
      `| ${batchSize.toLocaleString()} | ${insertSeconds.toFixed(2)} | ${rebuildSeconds.toFixed(2)} | ${totalSeconds.toFixed(2)} | ${rowsPerSecond.toFixed(0)} | ${projected500kSeconds.toFixed(2)} |`,
    );
  }
} finally {
  await client.db(dbName).dropDatabase();
  await client.close();
}

function buildBatch(startIndex: number, size: number): Profile[] {
  const batch: Profile[] = [];

  for (let offset = 0; offset < size; offset++) {
    const index = startIndex + offset;
    const createdAt = new Date(
      Date.UTC(2026, 0, 1, 0, 0, 0, index % 1000),
    ).toISOString();
    const age = 18 + (index % 50);
    const gender = index % 2 === 0 ? "male" : "female";
    const countryId = ["NG", "KE", "GH", "ZA", "AO", "SN", "CM", "BJ"][
      index % 8
    ]!;

    batch.push({
      id: `bench-${index}`,
      name: `Bench User ${index}`,
      gender,
      gender_probability: 0.5 + ((index % 40) / 100),
      sample_size: 100 + (index % 200),
      age,
      age_group: age <= 19 ? "teenager" : age <= 59 ? "adult" : "senior",
      country_id: countryId,
      country_name: countryId,
      country_probability: 0.4 + ((index % 30) / 100),
      created_at: createdAt,
    });
  }

  return batch;
}

async function aggressiveInsert(
  collection: Collection<ProfileDocument>,
  profiles: Profile[],
): Promise<void> {
  const uniqueProfilesByName = new Map<string, ProfileDocument>();

  for (const profile of profiles) {
    const nameKey = profile.name.trim().toLowerCase();
    if (!uniqueProfilesByName.has(nameKey)) {
      uniqueProfilesByName.set(nameKey, {
        ...profile,
        name_key: nameKey,
        created_at_date: new Date(profile.created_at),
      });
    }
  }

  const uniqueProfiles = Array.from(uniqueProfilesByName.values());
  const existingProfiles = await collection
    .find(
      { name_key: { $in: Array.from(uniqueProfilesByName.keys()) } },
      { projection: { _id: 0, name_key: 1 } },
    )
    .toArray();

  const existingNameKeys = new Set(
    existingProfiles.map((profile) => profile.name_key),
  );
  const insertCandidates = uniqueProfiles.filter(
    (profile) => !existingNameKeys.has(profile.name_key),
  );

  if (insertCandidates.length === 0) {
    return;
  }

  try {
    await collection.insertMany(insertCandidates, { ordered: false });
  } catch (error: any) {
    const writeErrors = Object.values(error?.writeErrors ?? {});
    if (writeErrors.some((entry: any) => entry.code !== 11000)) {
      throw error;
    }
  }
}

async function rebuildReadModel(
  collection: Collection<ProfileDocument>,
): Promise<void> {
  const documents = await collection.find({}).toArray();
  const engine = new ProfileQueryEngine();
  engine.hydrate(documents.map((document) => toProfile(document)));
}
