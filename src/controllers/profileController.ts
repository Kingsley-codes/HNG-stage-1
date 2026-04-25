// src/controllers/profileController.ts
import { Response } from "express";
import { v7 as uuidv7 } from "uuid";
import { db } from "../services/database.js";
import {
  fetchGender,
  fetchAge,
  fetchNationality,
} from "../services/apiClients.js";
import { parseNaturalLanguage } from "../services/nlpParser.js";
import { AuthRequest } from "../middleware/auth.js";
import { FilterOptions, Profile } from "../types/index.js";
import {
  getAgeGroup,
  validateName,
  applyFilters,
  applySorting,
  applyPagination,
} from "../utils/helpers.js";
import { logError } from "../middleware/logger.js";
import { TokenService } from "../services/tokenService.js";
import { Parser } from "json2csv";

const tokenService = new TokenService();

export const createProfile = async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is admin (should be caught by middleware, but double-check)
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Insufficient permissions. Admin access required.",
      });
    }

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

    const existingProfile = db.getProfileByName(name);
    if (existingProfile) {
      return res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: existingProfile,
      });
    }

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

    const topCountry = nationalityData.country.reduce(
      (prev: any, current: any) =>
        prev.probability > current.probability ? prev : current,
    );

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
    logError(error as Error, "POST /api/profiles");
    console.error("Error in POST /api/profiles:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const searchProfilesByNLP = (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Missing query parameter",
      });
    }

    const parsed = parseNaturalLanguage(query);

    if (!parsed.isValid) {
      return res.status(400).json({
        status: "error",
        message: parsed.error || "Unable to interpret query",
      });
    }

    let profiles = db.getAllProfiles();
    let filteredProfiles = applyFilters(profiles, parsed.filters);

    let page = parseInt(req.query.page as string) || 1;
    let limit = parseInt(req.query.limit as string) || 10;

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const total = filteredProfiles.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedProfiles = applyPagination(filteredProfiles, page, limit);

    // Generate pagination links
    const baseUrl = `/api/profiles/search`;
    const links = {
      self: `${baseUrl}?page=${page}&limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      next:
        page < totalPages
          ? `${baseUrl}?page=${page + 1}&limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`
          : null,
      prev:
        page > 1
          ? `${baseUrl}?page=${page - 1}&limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`
          : null,
    };

    return res.status(200).json({
      status: "success",
      page,
      limit,
      total,
      total_pages: totalPages,
      links,
      data: paginatedProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
        country_name: p.country_name,
      })),
    });
  } catch (error) {
    logError(error as Error, "GET /api/profiles/search");
    console.error("Error in GET /api/profiles/search:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const getProfileById = (req: AuthRequest, res: Response) => {
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
    logError(error as Error, "GET /api/profiles/:id");
    console.error("Error in GET /api/profiles/:id:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const getAllProfiles = (req: AuthRequest, res: Response) => {
  try {
    const filters: Partial<FilterOptions> = {};

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

    let page = parseInt(req.query.page as string) || 1;
    let limit = parseInt(req.query.limit as string) || 10;
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    const validSortFields = ["age", "created_at", "gender_probability"];
    const sortBy = (req.query.sort_by as string) || "created_at";
    const order: "asc" | "desc" =
      (req.query.order as string) === "desc" ? "desc" : "asc";

    if (!validSortFields.includes(sortBy)) {
      return res.status(422).json({
        status: "error",
        message: "Invalid query parameters",
      });
    }

    let profiles = db.getAllProfiles();
    let filteredProfiles = applyFilters(profiles, filters);
    const total = filteredProfiles.length;
    const totalPages = Math.ceil(total / limit);

    filteredProfiles = applySorting(filteredProfiles, sortBy, order);
    const paginatedProfiles = applyPagination(filteredProfiles, page, limit);

    // Generate pagination links
    const baseUrl = `/api/profiles`;
    const queryParams = new URLSearchParams();
    if (req.query.gender)
      queryParams.append("gender", req.query.gender as string);
    if (req.query.age_group)
      queryParams.append("age_group", req.query.age_group as string);
    if (req.query.country_id)
      queryParams.append("country_id", req.query.country_id as string);
    if (req.query.min_age)
      queryParams.append("min_age", req.query.min_age as string);
    if (req.query.max_age)
      queryParams.append("max_age", req.query.max_age as string);
    if (req.query.sort_by) queryParams.append("sort_by", sortBy);
    if (req.query.order) queryParams.append("order", order);

    const links = {
      self: `${baseUrl}?page=${page}&limit=${limit}${queryParams.toString() ? `&${queryParams.toString()}` : ""}`,
      next:
        page < totalPages
          ? `${baseUrl}?page=${page + 1}&limit=${limit}${queryParams.toString() ? `&${queryParams.toString()}` : ""}`
          : null,
      prev:
        page > 1
          ? `${baseUrl}?page=${page - 1}&limit=${limit}${queryParams.toString() ? `&${queryParams.toString()}` : ""}`
          : null,
    };

    return res.status(200).json({
      status: "success",
      page,
      limit,
      total,
      total_pages: totalPages,
      links,
      data: paginatedProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
        country_name: p.country_name,
      })),
    });
  } catch (error) {
    logError(error as Error, "GET /api/profiles");
    console.error("Error in GET /api/profiles:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const deleteProfile = (req: AuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Insufficient permissions. Admin access required.",
      });
    }

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
    logError(error as Error, "DELETE /api/profiles/:id");
    console.error("Error in DELETE /api/profiles/:id:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const exportProfiles = async (req: AuthRequest, res: Response) => {
  try {
    const format = req.query.format as string;

    if (!format || format !== "csv") {
      return res.status(400).json({
        status: "error",
        message: "Invalid format. Only CSV format is supported.",
      });
    }

    // Apply same filters as getAllProfiles
    const filters: Partial<FilterOptions> = {};

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
      if (!isNaN(minAge)) filters.min_age = minAge;
    }

    if (req.query.max_age) {
      const maxAge = parseInt(req.query.max_age as string);
      if (!isNaN(maxAge)) filters.max_age = maxAge;
    }

    let profiles = db.getAllProfiles();
    let filteredProfiles = applyFilters(profiles, filters);

    // Apply sorting if specified
    const validSortFields = ["age", "created_at", "gender_probability"];
    const sortBy = (req.query.sort_by as string) || "created_at";
    const order: "asc" | "desc" =
      (req.query.order as string) === "desc" ? "desc" : "asc";

    if (validSortFields.includes(sortBy)) {
      filteredProfiles = applySorting(filteredProfiles, sortBy, order);
    }

    // Prepare CSV data
    const csvData = filteredProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      gender: profile.gender,
      gender_probability: profile.gender_probability,
      age: profile.age,
      age_group: profile.age_group,
      country_id: profile.country_id,
      country_name: profile.country_name,
      country_probability: profile.country_probability,
      created_at: profile.created_at,
    }));

    const fields = [
      "id",
      "name",
      "gender",
      "gender_probability",
      "age",
      "age_group",
      "country_id",
      "country_name",
      "country_probability",
      "created_at",
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(csvData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `profiles_${timestamp}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.status(200).send(csv);
  } catch (error) {
    logError(error as Error, "GET /api/profiles/export");
    console.error("Error in GET /api/profiles/export:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};
