// src/server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import { v7 as uuidv7 } from "uuid";
import { db } from "./database.js";
import { fetchGender, fetchAge, fetchNationality } from "./apiClients.js";
import { Profile, FilterOptions, ProfilesListResponse } from "./types.js";
import { parseNaturalLanguage } from "./nlpParser.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(express.json());

function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function validateName(name: any): string | null {
  if (name === undefined || name === null) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function applyFilters(profiles: Profile[], filters: FilterOptions): Profile[] {
  let filtered = [...profiles];

  if (filters.gender) {
    filtered = filtered.filter(
      (p) => p.gender.toLowerCase() === filters.gender!.toLowerCase(),
    );
  }

  if (filters.age_group) {
    filtered = filtered.filter(
      (p) => p.age_group.toLowerCase() === filters.age_group!.toLowerCase(),
    );
  }

  if (filters.country_id) {
    filtered = filtered.filter(
      (p) => p.country_id.toLowerCase() === filters.country_id!.toLowerCase(),
    );
  }

  if (filters.min_age !== undefined) {
    filtered = filtered.filter((p) => p.age >= filters.min_age!);
  }

  if (filters.max_age !== undefined) {
    filtered = filtered.filter((p) => p.age <= filters.max_age!);
  }

  if (filters.min_gender_probability !== undefined) {
    filtered = filtered.filter(
      (p) => p.gender_probability >= filters.min_gender_probability!,
    );
  }

  if (filters.min_country_probability !== undefined) {
    filtered = filtered.filter(
      (p) => p.country_probability >= filters.min_country_probability!,
    );
  }

  return filtered;
}

function applySorting(
  profiles: Profile[],
  sortBy: string,
  order: "asc" | "desc",
): Profile[] {
  const sorted = [...profiles];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "age":
        comparison = a.age - b.age;
        break;
      case "created_at":
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "gender_probability":
        comparison = a.gender_probability - b.gender_probability;
        break;
      default:
        comparison = 0;
    }

    return order === "asc" ? comparison : -comparison;
  });

  return sorted;
}

function applyPagination(
  profiles: Profile[],
  page: number,
  limit: number,
): Profile[] {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  return profiles.slice(startIndex, endIndex);
}

// POST /api/profiles
app.post("/api/profiles", async (req: Request, res: Response) => {
  try {
    const name = validateName(req.body.name);

    if (name === null) {
      return res.status(400).json({
        status: "error",
        message: "Missing or empty name",
      });
    }

    if (typeof req.body.name !== "string") {
      return res.status(422).json({
        status: "error",
        message: "Invalid type",
      });
    }

    // Check for existing profile (idempotency)
    const existingProfile = db.getProfileByName(name);
    if (existingProfile) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existingProfile,
      });
    }

    // Fetch data from external APIs
    let genderData, ageData, nationalityData;

    try {
      [genderData, ageData, nationalityData] = await Promise.all([
        fetchGender(name),
        fetchAge(name),
        fetchNationality(name),
      ]);
    } catch (error: any) {
      const apiName = error.message.includes("Genderize")
        ? "Genderize"
        : error.message.includes("Agify")
          ? "Agify"
          : "Nationalize";
      return res.status(502).json({
        status: "error",
        message: `${apiName} returned an invalid response`,
      });
    }

    // Extract country with highest probability
    const topCountry = nationalityData.country.reduce((prev, current) =>
      prev.probability > current.probability ? prev : current,
    );

    // Create profile
    const profile: Profile = {
      id: uuidv7(),
      name: name,
      gender: genderData.gender!,
      gender_probability: genderData.probability,
      sample_size: genderData.count,
      age: ageData.age!,
      age_group: getAgeGroup(ageData.age!),
      country_id: topCountry.country_id,
      country_name: db.getCountryName(topCountry.country_id),
      country_probability: topCountry.probability,
      created_at: new Date().toISOString(),
    };

    db.saveProfile(profile);

    return res.status(201).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    console.error("Error in POST /api/profiles:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

// GET /api/profiles/:id
app.get("/api/profiles/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = db.getProfile(id);

    if (!profile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    console.error("Error in GET /api/profiles/:id:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

// GET /api/profiles (with filtering, sorting, pagination)
app.get("/api/profiles", (req: Request, res: Response) => {
  try {
    let profiles = db.getAllProfiles();

    // Build filters
    const filters: FilterOptions = {};

    if (req.query.gender && typeof req.query.gender === "string") {
      filters.gender = req.query.gender;
    }

    if (req.query.age_group && typeof req.query.age_group === "string") {
      filters.age_group = req.query.age_group;
    }

    if (req.query.country_id && typeof req.query.country_id === "string") {
      filters.country_id = req.query.country_id;
    }

    if (req.query.min_age) {
      const minAge = parseInt(req.query.min_age as string);
      if (isNaN(minAge)) {
        return res.status(422).json({
          status: "error",
          message: "Invalid query parameters",
        });
      }
      filters.min_age = minAge;
    }

    if (req.query.max_age) {
      const maxAge = parseInt(req.query.max_age as string);
      if (isNaN(maxAge)) {
        return res.status(422).json({
          status: "error",
          message: "Invalid query parameters",
        });
      }
      filters.max_age = maxAge;
    }

    if (req.query.min_gender_probability) {
      const minProb = parseFloat(req.query.min_gender_probability as string);
      if (isNaN(minProb) || minProb < 0 || minProb > 1) {
        return res.status(422).json({
          status: "error",
          message: "Invalid query parameters",
        });
      }
      filters.min_gender_probability = minProb;
    }

    if (req.query.min_country_probability) {
      const minProb = parseFloat(req.query.min_country_probability as string);
      if (isNaN(minProb) || minProb < 0 || minProb > 1) {
        return res.status(422).json({
          status: "error",
          message: "Invalid query parameters",
        });
      }
      filters.min_country_probability = minProb;
    }

    // Pagination parameters
    let page = parseInt(req.query.page as string) || 1;
    let limit = parseInt(req.query.limit as string) || 10;

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    // Sorting parameters
    let sortBy = (req.query.sort_by as string) || "created_at";
    let order: "asc" | "desc" =
      (req.query.order as string) === "desc" ? "desc" : "asc";

    if (!["age", "created_at", "gender_probability"].includes(sortBy)) {
      sortBy = "created_at";
    }

    // Apply filters
    let filteredProfiles = applyFilters(profiles, filters);
    const total = filteredProfiles.length;

    // Apply sorting
    filteredProfiles = applySorting(filteredProfiles, sortBy, order);

    // Apply pagination
    const paginatedProfiles = applyPagination(filteredProfiles, page, limit);

    const response: ProfilesListResponse = {
      status: "success",
      page: page,
      limit: limit,
      total: total,
      data: paginatedProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
        country_name: p.country_name,
      })),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in GET /api/profiles:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

// GET /api/profiles/search (Natural Language Query)
app.get("/api/profiles/search", (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Missing query parameter",
      });
    }

    // Parse natural language
    const parsed = parseNaturalLanguage(query);

    if (!parsed.isValid) {
      return res.status(400).json({
        status: "error",
        message: parsed.error || "Unable to interpret query",
      });
    }

    let profiles = db.getAllProfiles();

    // Apply parsed filters
    let filteredProfiles = applyFilters(profiles, parsed.filters);

    // Apply pagination
    let page = parseInt(req.query.page as string) || 1;
    let limit = parseInt(req.query.limit as string) || 10;

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const total = filteredProfiles.length;
    const paginatedProfiles = applyPagination(filteredProfiles, page, limit);

    const response: ProfilesListResponse = {
      status: "success",
      page: page,
      limit: limit,
      total: total,
      data: paginatedProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
        country_name: p.country_name,
      })),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in GET /api/profiles/search:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

// DELETE /api/profiles/:id
app.delete("/api/profiles/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = db.deleteProfile(id);

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error in DELETE /api/profiles/:id:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

// Root endpoint for testing
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Intelligence Query Engine API is running",
    endpoints: [
      "POST /api/profiles",
      "GET /api/profiles/:id",
      "GET /api/profiles",
      "GET /api/profiles/search?q=<natural language query>",
      "DELETE /api/profiles/:id",
    ],
    examples: {
      filters:
        "/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10",
      naturalLanguage: "/api/profiles/search?q=young males from nigeria",
    },
  });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", profiles: db.getProfileCount() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database contains ${db.getProfileCount()} profiles`);
});
