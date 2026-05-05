import { Response } from "express";
import { Parser } from "json2csv";
import { v7 as uuidv7 } from "uuid";
import { AuthRequest } from "../middleware/auth.js";
import { logError } from "../middleware/logger.js";
import { db } from "../services/database.js";
import { importProfilesFromCsvStream, CsvImportValidationError } from "../services/csvIngestion.js";
import {
  fetchAge,
  fetchGender,
  fetchNationality,
} from "../services/apiClients.js";
import { parseNaturalLanguage } from "../services/nlpParser.js";
import { FilterOptions } from "../types/index.js";
import { getAgeGroup, validateName } from "../utils/helpers.js";

const VALID_SORT_FIELDS = ["age", "created_at", "gender_probability"] as const;

export const createProfile = async (req: AuthRequest, res: Response) => {
  try {
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

    let genderData;
    let ageData;
    let nationalityData;

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
      (previous: any, current: any) =>
        previous.probability > current.probability ? previous : current,
    );

    const profile = {
      id: uuidv7(),
      name,
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
    await db.flush();

    return res.status(201).json({
      status: "success",
      data: profile,
    });
  } catch (error) {
    logError(error as Error, "POST /api/profiles");
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const importProfiles = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Insufficient permissions. Admin access required.",
      });
    }

    const contentType = req.headers["content-type"] ?? "";
    if (
      typeof contentType !== "string" ||
      ![
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
      ].some((allowedType) => contentType.includes(allowedType))
    ) {
      return res.status(415).json({
        status: "error",
        message:
          "Unsupported media type. Send the CSV file as the raw request body.",
      });
    }

    const summary = await importProfilesFromCsvStream(req);
    const statusCode = summary.status === "success" ? 200 : 500;
    return res.status(statusCode).json(summary);
  } catch (error) {
    if (error instanceof CsvImportValidationError) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    logError(error as Error, "POST /api/profiles/import");
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

    const options = parseQueryOptions(req);
    if ("error" in options) {
      return res.status(422).json({
        status: "error",
        message: options.error,
      });
    }

    const result = db.queryProfiles(parsed.filters, options, "profiles:nlp");
    const links = buildLinks("/api/profiles/search", req, result.page, result.total_pages, result.limit);

    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_pages: result.total_pages,
      links,
      data: toProfileSummary(result.data),
    });
  } catch (error) {
    logError(error as Error, "GET /api/profiles/search");
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const getProfileById = (req: AuthRequest, res: Response) => {
  try {
    const profile = db.getProfile(req.params.id);
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
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const getAllProfiles = (req: AuthRequest, res: Response) => {
  try {
    const filters = parseFilterOptions(req);
    if ("error" in filters) {
      return res.status(422).json({
        status: "error",
        message: filters.error,
      });
    }

    const options = parseQueryOptions(req);
    if ("error" in options) {
      return res.status(422).json({
        status: "error",
        message: options.error,
      });
    }

    const result = db.queryProfiles(filters, options, "profiles:list");
    const links = buildLinks("/api/profiles", req, result.page, result.total_pages, result.limit);

    return res.status(200).json({
      status: "success",
      page: result.page,
      limit: result.limit,
      total: result.total,
      total_pages: result.total_pages,
      links,
      data: toProfileSummary(result.data),
    });
  } catch (error) {
    logError(error as Error, "GET /api/profiles");
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const deleteProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        status: "error",
        message: "Insufficient permissions. Admin access required.",
      });
    }

    const deleted = db.deleteProfile(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
    }

    await db.flush();
    return res.status(204).send();
  } catch (error) {
    logError(error as Error, "DELETE /api/profiles/:id");
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

export const exportProfiles = (req: AuthRequest, res: Response) => {
  try {
    const format = req.query.format as string;
    if (format !== "csv") {
      return res.status(400).json({
        status: "error",
        message: "Invalid format. Only CSV format is supported.",
      });
    }

    const filters = parseFilterOptions(req);
    if ("error" in filters) {
      return res.status(422).json({
        status: "error",
        message: filters.error,
      });
    }

    const options = parseQueryOptions(req);
    if ("error" in options) {
      return res.status(422).json({
        status: "error",
        message: options.error,
      });
    }

    const filteredProfiles = db.exportProfiles(filters, options);
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

    const csv = new Parser({ fields }).parse(filteredProfiles);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `profiles_${timestamp}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    logError(error as Error, "GET /api/profiles/export");
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

function parseFilterOptions(
  req: AuthRequest,
): Partial<FilterOptions> | { error: string } {
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

  const minAge = parseOptionalInteger(req.query.min_age as string | undefined);
  if (minAge.error) {
    return { error: "Invalid query parameters" };
  }
  if (minAge.value !== undefined) {
    filters.min_age = minAge.value;
  }

  const maxAge = parseOptionalInteger(req.query.max_age as string | undefined);
  if (maxAge.error) {
    return { error: "Invalid query parameters" };
  }
  if (maxAge.value !== undefined) {
    filters.max_age = maxAge.value;
  }

  const minGenderProbability = parseOptionalNumber(
    req.query.min_gender_probability as string | undefined,
  );
  if (minGenderProbability.error) {
    return { error: "Invalid query parameters" };
  }
  if (minGenderProbability.value !== undefined) {
    filters.min_gender_probability = minGenderProbability.value;
  }

  const minCountryProbability = parseOptionalNumber(
    req.query.min_country_probability as string | undefined,
  );
  if (minCountryProbability.error) {
    return { error: "Invalid query parameters" };
  }
  if (minCountryProbability.value !== undefined) {
    filters.min_country_probability = minCountryProbability.value;
  }

  return filters;
}

function parseQueryOptions(
  req: AuthRequest,
): {
  page: number;
  limit: number;
  sort_by: "age" | "created_at" | "gender_probability";
  order: "asc" | "desc";
} | { error: string } {
  const page = parsePositiveInteger(req.query.page as string | undefined, 1);
  const limit = parsePositiveInteger(req.query.limit as string | undefined, 10);
  if (page.error || limit.error) {
    return { error: "Invalid query parameters" };
  }

  const sortBy = (req.query.sort_by as string | undefined) ?? "created_at";
  if (!VALID_SORT_FIELDS.includes(sortBy as (typeof VALID_SORT_FIELDS)[number])) {
    return { error: "Invalid query parameters" };
  }

  return {
    page: page.value,
    limit: Math.min(limit.value, 50),
    sort_by: sortBy as "age" | "created_at" | "gender_probability",
    order: req.query.order === "desc" ? "desc" : "asc",
  };
}

function parseOptionalInteger(
  value: string | undefined,
): { value?: number; error?: true } {
  if (value === undefined) {
    return {};
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return { error: true };
  }

  return { value: parsed };
}

function parseOptionalNumber(
  value: string | undefined,
): { value?: number; error?: true } {
  if (value === undefined) {
    return {};
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { error: true };
  }

  return { value: parsed };
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): { value: number; error?: true } {
  if (value === undefined) {
    return { value: fallback };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return { value: fallback, error: true };
  }

  return { value: Math.max(parsed, 1) };
}

function buildLinks(
  baseUrl: string,
  req: AuthRequest,
  page: number,
  totalPages: number,
  limit: number,
) {
  const buildLink = (targetPage: number | null) => {
    if (targetPage === null) {
      return null;
    }

    const params = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (typeof value === "string" && key !== "page" && key !== "limit") {
        params.set(key, value);
      }
    });
    params.set("page", String(targetPage));
    params.set("limit", String(limit));
    return `${baseUrl}?${params.toString()}`;
  };

  return {
    self: buildLink(page)!,
    next: page < totalPages ? buildLink(page + 1) : null,
    prev: page > 1 ? buildLink(page - 1) : null,
  };
}

function toProfileSummary(
  profiles: Array<{
    id: string;
    name: string;
    gender: string;
    age: number;
    age_group: string;
    country_id: string;
    country_name: string;
  }>,
) {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    gender: profile.gender,
    age: profile.age,
    age_group: profile.age_group,
    country_id: profile.country_id,
    country_name: profile.country_name,
  }));
}
