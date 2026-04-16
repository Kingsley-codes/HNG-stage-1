// src/server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import { v7 as uuidv7 } from "uuid";
import { db } from "./database.js";
import { fetchGender, fetchAge, fetchNationality } from "./apiClients.js";
import { Profile, ProfilesListResponse } from "./types.js";

const app = express();
const PORT = 3000;

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

// GET /api/profiles
app.get("/api/profiles", (req: Request, res: Response) => {
  try {
    let profiles = db.getAllProfiles();

    // Apply filters (case-insensitive)
    const { gender, country_id, age_group } = req.query;

    if (gender && typeof gender === "string") {
      profiles = profiles.filter(
        (p) => p.gender.toLowerCase() === gender.toLowerCase(),
      );
    }

    if (country_id && typeof country_id === "string") {
      profiles = profiles.filter(
        (p) => p.country_id.toLowerCase() === country_id.toLowerCase(),
      );
    }

    if (age_group && typeof age_group === "string") {
      profiles = profiles.filter(
        (p) => p.age_group.toLowerCase() === age_group.toLowerCase(),
      );
    }

    const response: ProfilesListResponse = {
      status: "success",
      count: profiles.length,
      data: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
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

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
