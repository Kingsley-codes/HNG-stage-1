# Intelligence Query Engine

A production-ready demographic intelligence API that collects, stores, and queries profile data with advanced filtering, sorting, pagination, and natural language query capabilities.

## Features

- ✅ **Profile Management** - Create, read, and delete profiles
- ✅ **External API Integration** - Fetches gender, age, and nationality data from public APIs
- ✅ **Advanced Filtering** - Filter by gender, age group, country, age ranges, and probability scores
- ✅ **Sorting** - Sort by age, creation date, or gender probability
- ✅ **Pagination** - Efficient data retrieval with configurable page sizes (max 50)
- ✅ **Natural Language Queries** - Query using plain English (no AI/LLM required)
- ✅ **Data Persistence** - JSON file-based storage with automatic saving
- ✅ **Idempotent Seeding** - No duplicate records when re-running seeds

## API Endpoints

### 1. Create Profile

POST /api/profiles
Content-Type: application/json

{
"name": "John Doe"
}

### 2. Get Profile by ID

GET /api/profiles/:id

### 3. List Profiles with Filters

GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10

**Supported Filters:**

- `gender` - male/female
- `age_group` - child/teenager/adult/senior
- `country_id` - ISO country code (NG, KE, ZA, etc.)
- `min_age` - Minimum age
- `max_age` - Maximum age
- `min_gender_probability` - 0-1 confidence score
- `min_country_probability` - 0-1 confidence score
- `sort_by` - age/created_at/gender_probability
- `order` - asc/desc
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 50)

### 4. Natural Language Search

GET /api/profiles/search?q=young males from nigeria

**Supported Query Patterns:**

- `young males from nigeria` → gender=male, min_age=16, max_age=24, country_id=NG
- `females above 30` → gender=female, min_age=30
- `people from angola` → country_id=AO
- `adult males from kenya` → gender=male, age_group=adult, country_id=KE
- `teenagers` → age_group=teenager
- `seniors from south africa` → age_group=senior, country_id=ZA

### 5. Delete Profile

DELETE /api/profiles/:id

## Setup Instructions

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**
   git clone <your-repo-url>
   cd intelligence-query-engine

2. **Install dependencies**
   npm install

3. **Build the project**
   npm run build

4. **Seed the database**

# First, place your seed-data.json in the root directory

npm run seed

5. **Start the server**
   npm start

# For development with auto-reload:

npm run dev

## Testing the API

Example Requests
bash

# Create a profile

curl -X POST https://yourapp.domain.app/api/profiles \
 -H "Content-Type: application/json" \
 -d '{"name":"John Doe"}'

# Get all Nigerian males aged 25+

curl "https://yourapp.domain.app/api/profiles?gender=male&country_id=NG&min_age=25"

# Natural language search

curl "https://yourapp.domain.app/api/profiles/search?q=young females from kenya"

# Get profiles sorted by age

curl "https://yourapp.domain.app/api/profiles?sort_by=age&order=desc&limit=20"

# Pagination

curl "https://yourapp.domain.app/api/profiles?page=2&limit=10"

# Response Formats

## Success Response (List)

**json**
{
"status": "success",
"page": 1,
"limit": 10,
"total": 2026,
"data": [
{
"id": "uuid-v7",
"name": "John Doe",
"gender": "male",
"age": 28,
"age_group": "adult",
"country_id": "NG",
"country_name": "Nigeria"
}
]
}

## Error Response

**json**
{
"status": "error",
"message": "Unable to interpret query"
}

# Performance Considerations

- In-memory processing with efficient array operations
- Pagination limits response sizes to max 50 records
- Indexed lookups via nameIndex Map for O(1) profile retrieval
- No unnecessary database scans - all operations are O(n) where n is filtered set size

# Natural Language Query Rules

The parser uses rule-based matching (no AI/LLMs) with the following mappings:

- Gender: male, female, man, woman, boy, girl, etc.
- Age Groups: child, teenager, adult, senior
- Age Ranges: "young" → 16-24 years
- Comparisons: "above X", "over X", "below X", "under X"
- Countries: Supports common names and demonyms
- Combinations: "male and female" removes gender filter

# Error Codes

- 400 - Missing or empty parameter
- 422 - Invalid parameter type
- 404 - Profile not found
- 500 - Internal server error
- 502 - External API error

# Database Schema

Field Type Description
id UUID v7 Primary key
name string Person's full name (unique)
gender string "male" or "female"
gender_probability float Confidence score (0-1)
sample_size int Number of samples
age int Exact age
age_group string child/teenager/adult/senior
country_id string(2) ISO country code
country_name string Full country name
country_probability float Confidence score (0-1)
created_at timestamp ISO 8601 UTC

# License

## MIT

## Deployment URL

**Public API Base URL:** `https://hng-stage-1-production-6f26.up.railway.app`

## Summary

This implementation provides:

1. **Complete filtering system** with 7 filter types
2. **Combined filters** - all conditions must match
3. **Sorting** on 3 fields with asc/desc
4. **Pagination** with page/limit (max 50)
5. **Natural language parsing** with 20+ query patterns
6. **Rule-based parsing** - no AI/LLM dependencies
7. **Validation** for all query parameters
8. **Performance** optimized for 2026+ records
9. **Idempotent seeding** - no duplicates
10. **Complete error handling** with proper status codes

The system is production-ready and can be deployed immediately to any Node.js hosting platform.
