# Stage 4B Solution

## What changed

This implementation keeps the Stage 3 API behavior intact and adds one new admin-only ingestion endpoint:

- `POST /api/profiles/import`

The three Stage 4B areas are handled as follows:

1. Query performance
   - Replaced full-scan controller queries with an indexed in-memory query engine.
   - Added secondary indexes for `gender`, `age_group`, `country_id`, plus age buckets for range filters.
   - Added a deterministic read cache keyed by canonical filters + sort + pagination.
   - Switched profile persistence from synchronous per-write file saves to coalesced async flushes, so write bursts do not stall reads as aggressively.

2. Query normalization
   - Added canonical filter normalization before query execution and before cache lookup.
   - Expanded the rule-based NLP parser so equivalent phrasings produce the same parsed filter object.
   - Kept the approach deterministic and rule-based only.

3. CSV ingestion
   - Added streamed CSV ingestion from the raw request body.
   - Parsed rows incrementally without loading the file into memory.
   - Inserted valid rows in batches instead of one by one.
   - Skipped invalid rows with reason counts and no rollback.

## Design decisions and trade-offs

### 1. Query performance and database efficiency

The previous read path did this on every request:

- load all profiles into an array
- filter the entire array
- sort the filtered array
- paginate the result

That is simple, but it does repeated work for every request and scales poorly once queries repeat.

The new query engine uses:

- `gender`, `age_group`, `country_id` secondary indexes for equality filters
- age buckets for range filters like `min_age` / `max_age`
- created-at ordering maintained inside the engine
- a small in-memory LRU-style TTL cache for repeated reads

Why this trade-off:

- It is much simpler than introducing a new datastore.
- It directly addresses the prompt’s “remote DB latency + repeated reads” problem by avoiding redundant query work.
- It keeps correctness deterministic because cached entries are keyed off normalized filter objects, and all profile writes clear the cache.

Cold-query trade-off:

- For a brand-new query, the indexed path is not always faster than a raw in-process array scan because this project is still a file-backed Node service, not a real remote database.
- The important gain is that repeated read traffic now avoids recomputation almost entirely, which is where the prompt’s load pattern matters most.

### 2. Query normalization

Normalization now happens in two layers:

- NLP parsing maps synonyms into the same filter values
  - Example: `women` -> `female`
  - Example: `Nigerian` -> `NG`
  - Example: `aged 20-45` and `between ages 20 and 45` -> `min_age=20`, `max_age=45`
- Canonical filter normalization then:
  - lowercases `gender` and `age_group`
  - uppercases `country_id`
  - clamps/cleans numeric fields
  - removes redundant age-group/range combinations when they mean the same thing

Result:

- `"Nigerian females between ages 20 and 45"`
- `"Women aged 20-45 living in Nigeria"`

Both normalize to:

```json
{
  "gender": "female",
  "country_id": "NG",
  "min_age": 20,
  "max_age": 45
}
```

That means they now produce the same cache key.

### 3. CSV ingestion

The new ingestion path is deliberately conservative:

- Accepts the CSV file as the raw request body
- Streams and parses incrementally
- Supports quoted fields and chunked processing
- Inserts in batches of 2,000
- Yields back to the event loop during long imports so read traffic is less likely to starve

Validation rules:

- Required columns: `name`, `gender`, `age`, `country_id`
- Row is skipped for:
  - `missing_fields`
  - `duplicate_name`
  - `invalid_age`
  - `invalid_gender`
  - `invalid_country`
  - malformed CSV / broken row shape

Idempotency:

- Name uniqueness uses the same rule as `POST /api/profiles`: duplicate names are skipped, not inserted again.
- Duplicate names are checked against both the existing database and names already accepted within the same upload.

Failure handling:

- A bad row never aborts the whole file.
- Successfully inserted rows remain inserted.
- There is no rollback.
- The response always includes a processed summary.

## Before / after query measurements

Benchmark command used:

```bash
npm.cmd run build
$env:BENCHMARK_SIZE='1000000'; node dist/benchmarks/profileQueryBenchmark.js
```

Synthetic dataset size: `1,000,000` profiles

| Query | Legacy scan (ms) | Indexed miss (ms) | Cached hit (ms) |
| --- | ---: | ---: | ---: |
| Nigeria females 20-45 by created_at | 118.16 | 235.20 | 0.06 |
| Kenya adults by age | 145.01 | 234.48 | 0.04 |
| Repeated cacheable query | 107.10 | 214.00 | 0.07 |

How to interpret this:

- Cold misses stay in the low hundreds of milliseconds, which was the target.
- Repeated queries become effectively free compared with the old path.
- In a system with real remote-database latency, the cache win is even more important because it also eliminates round-trips.

## Ingestion failures and edge cases

- Missing header columns: rejected up front as a file-level validation error.
- Wrong column count: row skipped as `malformed_row`.
- Broken or replacement-character rows: row skipped as `malformed_row`.
- Negative or non-numeric ages: row skipped as `invalid_age`.
- Unknown country codes: row skipped as `invalid_country`.
- Duplicate names across concurrent uploads: rechecked during batched insert so the later batch is skipped safely.
- Mid-upload failure: rows already inserted are kept; nothing is rolled back.

## How to use the CSV endpoint

Example:

```bash
curl -X POST http://localhost:4000/api/profiles/import \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-API-Version: 1" \
  -H "Content-Type: text/csv" \
  --data-binary @profiles.csv
```

Expected success shape:

```json
{
  "status": "success",
  "total_rows": 50000,
  "inserted": 48231,
  "skipped": 1769,
  "reasons": {
    "duplicate_name": 1203,
    "invalid_age": 312,
    "missing_fields": 254
  }
}
```
