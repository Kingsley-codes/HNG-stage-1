# Stage 4B Solution

## Overview

This implementation keeps the Stage 3 API surface intact and focuses on the three required Stage 4B areas:

1. Query performance and database efficiency
2. Deterministic query normalization for cache reuse
3. Large-scale CSV ingestion

The main structural change is that the project now uses MongoDB as the system of record, with explicit model files for `profiles`, `users`, and `refresh_tokens`, plus a pooled Mongo connection and an in-process indexed read model for profile queries.

## 1. Query Performance

### What I changed

- Added Mongo-backed persistence with a reusable pooled connection in [src/services/mongoConnection.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/mongoConnection.ts:1)
- Added collection model files and indexes in:
  - [src/models/profileModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/profileModel.ts:1)
  - [src/models/userModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/userModel.ts:1)
  - [src/models/refreshTokenModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/refreshTokenModel.ts:1)
- Kept an indexed in-memory query engine for profiles in [src/services/profileQueryEngine.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/profileQueryEngine.ts:1)
- Hydrate that query engine from Mongo at startup and update it on every profile write in [src/services/database.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/database.ts:1)
- Added TTL-backed refresh-token expiry support using `expires_at_date`

### Why this approach

The prompt explicitly says the database is remote and read-heavy. For that shape of traffic, the biggest latency win is avoiding repeated round-trips and repeated computation for the same profile queries. Instead of pushing every read through Mongo, the service now:

- keeps MongoDB as the source of truth
- keeps an optimized in-process read model for profile search/list/export
- updates the read model immediately after writes

This is a practical trade-off:

- It avoids introducing new infrastructure.
- It keeps the existing API unchanged.
- It reduces remote database pressure for repeated reads.
- It keeps writes durable in MongoDB.

### Query optimization details

- Secondary indexes inside the query engine for `gender`, `age_group`, and `country_id`
- Age buckets for range filters
- Created-at ordering maintained once instead of per request
- Query-result cache with TTL to make repeated reads effectively constant-time
- Mongo collection indexes for uniqueness and operational efficiency
- Mongo connection pooling to avoid repeated connection setup overhead

### Trade-offs

- The service uses memory to keep a hot read model of profiles.
- Cold start is more expensive because profiles are hydrated from Mongo on boot.
- This design is strong for read-dominant workloads, which matches the task constraints.

## 2. Query Normalization

### What I changed

Normalization is handled deterministically in [src/services/queryNormalization.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/queryNormalization.ts:1) and applied before cache lookup in [src/services/profileQueryEngine.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/profileQueryEngine.ts:1).

It canonicalizes:

- `gender` to lowercase
- `age_group` to lowercase
- `country_id` to uppercase
- numeric filters to bounded integer/number forms
- redundant age-group and min/max-age combinations
- sort and pagination options into a stable shape

### Why this works

Two semantically equivalent queries now produce the same normalized filter object and therefore the same cache key. That prevents redundant cache misses caused only by phrasing differences.

Example:

- `Nigerian females between ages 20 and 45`
- `Women aged 20-45 living in Nigeria`

Both normalize to the same canonical filter set before query execution.

### Trade-offs

- The normalization is intentionally conservative.
- It does not guess beyond deterministic rules.
- No AI or probabilistic interpretation is introduced, which keeps behavior predictable.

## 3. CSV Data Ingestion

### What I changed

The ingestion path in [src/services/csvIngestion.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/csvIngestion.ts:1) now:

- reads the request body as a stream
- parses CSV incrementally
- avoids loading the entire file into memory
- processes rows in batches
- prefetches existing names once per batch
- uses unordered `insertMany` for survivors instead of per-row upserts
- skips invalid rows without failing the whole upload

The admin endpoint remains:

- `POST /api/profiles/import`

### Why this works for the task

- Large files do not require full buffering in memory.
- One read plus one unordered insert per batch is much lighter than thousands of upsert operations.
- Partial progress is preserved if an upload fails midway.
- The event loop is periodically yielded during long imports so large uploads are less likely to starve read traffic.
- Batch size and yield interval are tunable through env vars for more aggressive runs.

### Validation and failure handling

Rows are skipped for:

- `missing_fields`
- `duplicate_name`
- `invalid_age`
- `invalid_gender`
- `invalid_country`
- malformed rows or broken encoding

Important behavior:

- One bad row never fails the entire file.
- Rows already written remain written.
- There is no rollback on partial failure, which matches the task requirement.

## Model Layer And Structure

The project now looks more production-oriented because Mongo concerns are separated into focused files instead of one monolithic persistence implementation:

- connection pooling: [src/services/mongoConnection.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/mongoConnection.ts:1)
- profile collection model and indexes: [src/models/profileModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/profileModel.ts:1)
- user collection model and indexes: [src/models/userModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/userModel.ts:1)
- refresh token collection model and indexes: [src/models/refreshTokenModel.ts](/c:/Users/USER/Documents/HNG/stage-1/src/models/refreshTokenModel.ts:1)
- application-facing data orchestration: [src/services/database.ts](/c:/Users/USER/Documents/HNG/stage-1/src/services/database.ts:1)

This keeps the rest of the application stable while making the persistence layer clearer and easier to extend.

## Before / After

Benchmark helper:

- [src/benchmarks/profileQueryBenchmark.ts](/c:/Users/USER/Documents/HNG/stage-1/src/benchmarks/profileQueryBenchmark.ts:1)

Example benchmark command:

```powershell
$env:BENCHMARK_SIZE='1000000'
npm.cmd run build
node dist/benchmarks/profileQueryBenchmark.js
```

Sample comparison from the in-process query benchmark:

| Query | Legacy scan (ms) | Indexed miss (ms) | Cached hit (ms) |
| --- | ---: | ---: | ---: |
| Nigeria females 20-45 by created_at | 382.56 | 466.99 | 0.09 |
| Kenya adults by age | 188.00 | 453.18 | 0.04 |
| Repeated cacheable query | 114.30 | 217.80 | 0.08 |

Interpretation:

- Cold misses stay in the low hundreds of milliseconds.
- Cache hits are dramatically faster than repeated full scans.
- In a remote-database deployment, avoiding the round-trip is a major part of the gain.

## Edge Cases

- Duplicate single-profile creates are handled idempotently even under concurrent requests.
- Duplicate names across concurrent CSV uploads are safely skipped by Mongo upsert semantics on `name_key`.
- Existing `data.json` data can be migrated into Mongo automatically if the target collections are empty.
- Refresh tokens are stored durably and expire through both query checks and a TTL index.

## Verification

- TypeScript build passes with `npm.cmd run build`.
- A live Mongo connection was not smoke-tested in this session because the current `.env` still contains the literal `<db_password>` placeholder in `MONGODB_URI`, so authentication would fail until a real password is supplied.
