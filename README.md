# README.md

# Profile Intelligence Service

A REST API service that enriches name data using external APIs (Genderize, Agify, Nationalize) and stores profiles with intelligent deduplication.

## Features

- **Multi-API Integration**: Fetches data from three external APIs simultaneously
- **Idempotency**: Same name returns existing profile without duplication
- **Local JSON Storage**: File-based database (no external DB required)
- **Filtering**: Filter profiles by gender, country, or age group
- **UUID v7**: Timestamp-sortable unique identifiers
- **CORS Enabled**: Allows cross-origin requests

## API Endpoints

### POST /api/profiles

Create or retrieve a profile by name

**Request Body:**

```json
{
  "name": "ella"
}
```
