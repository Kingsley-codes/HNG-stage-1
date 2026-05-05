# Intelligence Query Engine

An Express + TypeScript API for building and querying enriched demographic profiles. The service accepts a person's name, enriches it with public inference APIs, stores the resulting profile in MongoDB, and exposes authenticated endpoints for filtering, natural-language search, CSV export, and profile management.

## Overview

This project now includes more than profile lookup. It also ships with:

- JWT-based authentication
- GitHub OAuth for web and CLI clients
- role-based access control for `admin` and `analyst` users
- API version enforcement with `X-API-Version`
- request rate limiting
- request and error logging
- MongoDB persistence for profiles, users, and refresh tokens
- indexed in-memory query acceleration for profile reads
- streamed CSV ingestion for large bulk uploads

## Features

- Create enriched profiles from a single `name` input
- Fetch inferred gender, age, and nationality from external APIs
- Persist profiles in MongoDB
- Filter profiles by gender, age group, age range, country, and confidence thresholds
- Sort and paginate profile results
- Search profiles with rule-based natural-language queries
- Export filtered profiles as CSV
- Support signup/login with email and password
- Support GitHub OAuth with PKCE for web and CLI clients
- Protect routes with authentication, RBAC, and API versioning

## Tech Stack

- Node.js
- TypeScript
- Express
- JWT
- bcrypt
- cookie-parser
- cors
- helmet
- json2csv
- uuid

## Architecture

### Data flow

1. A client authenticates with local credentials or GitHub OAuth.
2. The client calls protected profile endpoints with a Bearer token or HTTP-only cookie.
3. When a profile is created, the API queries:
   - `genderize.io`
   - `agify.io`
   - `nationalize.io`
4. The enriched profile is stored in MongoDB and reflected into the in-process profile query engine.
5. Read endpoints apply filtering, sorting, pagination, NLP parsing, or CSV export on the cached profile dataset.

### Persistence

This service uses MongoDB as its system of record and keeps an in-memory indexed read model for fast profile queries.

- Profiles are stored in the `profiles` collection
- Users are stored in the `users` collection
- Refresh tokens are stored in the `refresh_tokens` collection
- Existing `data.json` content can be migrated automatically on first boot if the Mongo collections are empty
- Request and error logs are written to `logs/`

## Project Structure

```text
src/
  config/         Environment loading and validation
  controllers/    Route handlers
  models/         Mongo collection document definitions and indexes
  middleware/     Auth, RBAC, rate limiting, logging, versioning
  routes/         Express routers
  services/       Auth, GitHub OAuth, token, Mongo access, NLP, external API clients
  types/          Shared TypeScript types
  utils/          Filtering, sorting, pagination, validation helpers
  server.ts       Application entry point
data.json         Optional one-time migration source
logs/             Access and error logs
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm
- GitHub OAuth app credentials if you want GitHub login enabled

### Installation

**Clone the repository**

```bash
   git clone https://github.com/Kingsley-codes/HNG-stage-1.git
   cd HNG-stage-1
```

**Install dependencies**

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root.

| Variable                   | Required                | Description                                            |
| -------------------------- | ----------------------- | ------------------------------------------------------ |
| `PORT`                     | Yes                     | Port the API listens on                                |
| `NODE_ENV`                 | No                      | Runtime mode, usually `development` or `production`    |
| `MONGODB_URI`              | Yes                     | MongoDB connection string                              |
| `MONGODB_DB_NAME`          | No                      | MongoDB database name, defaults to `profile_intelligence_service` |
| `INGESTION_BATCH_SIZE`     | No                      | CSV insert chunk size, defaults to `10000`            |
| `INGESTION_YIELD_INTERVAL` | No                      | Rows processed before yielding the event loop, defaults to `5000` |
| `JWT_ACCESS_SECRET`        | Yes                     | Secret used to sign access tokens                      |
| `JWT_REFRESH_SECRET`       | Yes                     | Secret used to hash/validate refresh token state       |
| `ACCESS_TOKEN_EXPIRY`      | No                      | Access token TTL in seconds                            |
| `REFRESH_TOKEN_EXPIRY`     | No                      | Refresh token TTL in seconds                           |
| `GITHUB_CLIENT_ID`         | Yes for GitHub web auth | GitHub OAuth client ID for the web app                 |
| `GITHUB_CLIENT_SECRET`     | Yes for GitHub web auth | GitHub OAuth client secret for the web app             |
| `GITHUB_REDIRECT_URI`      | Yes for GitHub web auth | OAuth callback URI for the web app                     |
| `GITHUB_CLI_CLIENT_ID`     | Yes for GitHub CLI auth | GitHub OAuth client ID for the CLI app                 |
| `GITHUB_CLI_CLIENT_SECRET` | Yes for GitHub CLI auth | GitHub OAuth client secret for the CLI app             |
| `GITHUB_CLI_REDIRECT_URI`  | Yes for GitHub CLI auth | OAuth callback URI for the CLI app                     |
| `WEB_PORTAL_URL`           | No                      | Allowed frontend origin and post-login redirect target |
| `CLI_CALLBACK_PORT`        | No                      | Allowed localhost origin for CLI callback flows        |
| `RATE_LIMIT_AUTH`          | No                      | Intended auth rate limit setting                       |
| `RATE_LIMIT_DEFAULT`       | No                      | Intended default rate limit setting                    |
| `API_VERSION`              | No                      | Expected value for `X-API-Version`                     |

Notes:

- The current env validation requires `MONGODB_URI`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` at startup.

### Run in Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Start Production Build

```bash
npm start
```

## Authentication and Authorization

### Supported auth modes

- Email/password signup and login
- GitHub OAuth with PKCE for web clients
- GitHub OAuth with PKCE for CLI clients
- Access token delivery through Bearer auth or HTTP-only cookies
- Refresh token rotation via `/auth/refresh`

### Roles

- `analyst`: read-only access to profile endpoints
- `admin`: full access, including create and delete operations

### Protected profile routes

All `/api/profiles` routes require:

- a valid access token
- the `X-API-Version` header
- passing the default rate limiter

Example header:

```http
X-API-Version: 1
```

## API Endpoints

### Health

| Method | Endpoint  | Description                     |
| ------ | --------- | ------------------------------- |
| `GET`  | `/`       | API root summary                |
| `GET`  | `/health` | Health check with profile count |

### Auth

| Method | Endpoint                | Description                             |
| ------ | ----------------------- | --------------------------------------- |
| `POST` | `/auth/signup`          | Create a local user                     |
| `POST` | `/auth/login`           | Login with email and password           |
| `POST` | `/auth/refresh`         | Exchange a refresh token for new tokens |
| `POST` | `/auth/logout`          | Revoke refresh token and clear cookies  |
| `GET`  | `/auth/me`              | Return current authenticated user       |
| `GET`  | `/auth/github`          | Start GitHub OAuth flow                 |
| `GET`  | `/auth/github/callback` | Complete GitHub OAuth flow              |

### Profiles

All profile endpoints require authentication and `X-API-Version`.

| Method   | Endpoint                          | Role               | Description                                         |
| -------- | --------------------------------- | ------------------ | --------------------------------------------------- |
| `POST`   | `/api/profiles`                   | `admin`            | Create an enriched profile from a name              |
| `GET`    | `/api/profiles`                   | `analyst`, `admin` | List profiles with filters, sorting, and pagination |
| `GET`    | `/api/profiles/search?q=...`      | `analyst`, `admin` | Rule-based natural-language search                  |
| `GET`    | `/api/profiles/export?format=csv` | `analyst`, `admin` | Export filtered profiles as CSV                     |
| `GET`    | `/api/profiles/:id`               | `analyst`, `admin` | Fetch a profile by ID                               |
| `DELETE` | `/api/profiles/:id`               | `admin`            | Delete a profile                                    |

## Request Examples

### Signup

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "username": "admin",
    "password": "StrongPass1!",
    "role": "admin"
  }'
```

### Login for API usage

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "StrongPass1!",
    "clientType": "cli"
  }'
```

### Create a profile

```bash
curl -X POST http://localhost:4000/api/profiles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-API-Version: 1" \
  -d '{
    "name": "John Doe"
  }'
```

### List profiles with filters

```bash
curl "http://localhost:4000/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-API-Version: 1"
```

### Natural-language search

```bash
curl "http://localhost:4000/api/profiles/search?q=young males from nigeria" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-API-Version: 1"
```

### Export CSV

```bash
curl "http://localhost:4000/api/profiles/export?format=csv&country_id=NG" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-API-Version: 1" \
  --output profiles.csv
```

## Filtering, Sorting, and Pagination

### Supported filters

- `gender`
- `age_group`
- `country_id`
- `min_age`
- `max_age`
- `min_gender_probability`
- `min_country_probability`

### Supported sorting

- `age`
- `created_at`
- `gender_probability`

### Pagination

- `page` defaults to `1`
- `limit` defaults to `10`
- `limit` is capped at `50`

## Natural-Language Search

The NLP layer is rule-based, not LLM-based. It currently supports patterns such as:

- `young males`
- `young females`
- `females above 30`
- `people from nigeria`
- `adult males from kenya`
- `teenagers`
- `seniors`
- `male and female teenagers above 17`

Country support in the parser is currently limited to a small mapping that includes names such as Nigeria, Kenya, South Africa, Angola, and Ghana.

## Response Shape

### Successful list response

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 1,
  "total_pages": 1,
  "links": {
    "self": "/api/profiles?page=1&limit=10",
    "next": null,
    "prev": null
  },
  "data": [
    {
      "id": "019...",
      "name": "John Doe",
      "gender": "male",
      "age": 28,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria"
    }
  ]
}
```

### Successful single resource response

```json
{
  "status": "success",
  "data": {
    "id": "019...",
    "name": "John Doe",
    "gender": "male",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 28,
    "age_group": "adult",
    "country_id": "NG",
    "country_name": "Nigeria",
    "country_probability": 0.87,
    "created_at": "2026-04-29T09:00:00.000Z"
  }
}
```

### Error response

```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

## Security Notes

- `helmet` is enabled globally
- CORS is restricted to `WEB_PORTAL_URL` and the configured localhost CLI callback origin
- Profile routes require JWT authentication
- Access control is role-based
- Refresh tokens are hashed before storage
- Auth and profile routes are rate-limited
- Cookie-based auth is supported for web clients

The repository also includes CSRF helper middleware for cookie-based flows, but it is not currently mounted in `src/server.ts`.

## Logging

Request and response logs are written to daily files in `logs/`. Errors are written to separate daily error logs.

## Operational Notes

- The app starts even if no admin exists, but it logs a reminder to create one.
- Creating a profile depends on public third-party APIs being reachable and returning usable data.
- Profile reads are served from an in-memory indexed read model, so memory sizing matters as the dataset grows.
- MongoDB remains the source of truth, and `data.json` is only used as an optional migration source on first boot.

## Known Gaps

- `package.json` references `src/seed.ts` and `src/force-seed.ts`, but those files are not currently present in this repository snapshot.
- The rate-limit values in middleware are hard-coded today, even though environment variables exist for them.
- The natural-language parser supports a focused set of patterns rather than open-ended query interpretation.

## License

MIT
