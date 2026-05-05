import { v7 as uuidv7 } from "uuid";
import { db } from "./database.js";
import { CsvImportSummary, Profile } from "../types/index.js";
import { getAgeGroup, validateName } from "../utils/helpers.js";

const REQUIRED_COLUMNS = ["name", "gender", "age", "country_id"] as const;
const HEADER_ALIASES: Record<string, string> = {
  id: "id",
  name: "name",
  full_name: "name",
  gender: "gender",
  sex: "gender",
  age: "age",
  country_id: "country_id",
  country: "country_id",
  country_code: "country_id",
  nationality: "country_id",
  gender_probability: "gender_probability",
  sample_size: "sample_size",
  country_probability: "country_probability",
  country_name: "country_name",
  age_group: "age_group",
  created_at: "created_at",
};

const BATCH_SIZE = 2_000;
const YIELD_INTERVAL_ROWS = 1_000;

export class CsvImportValidationError extends Error {}

export async function importProfilesFromCsvStream(
  stream: NodeJS.ReadableStream,
): Promise<CsvImportSummary> {
  const summary: CsvImportSummary = {
    status: "success",
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {},
  };

  let headers: string[] | null = null;
  let validBatch: Profile[] = [];
  const seenNames = new Set<string>();

  const flushBatch = async () => {
    if (validBatch.length === 0) {
      return;
    }

    const { inserted, duplicates } = await db.bulkInsertProfiles(validBatch);
    summary.inserted += inserted;

    if (duplicates > 0) {
      summary.skipped += duplicates;
      incrementReason(summary.reasons, "duplicate_name", duplicates);
    }

    validBatch = [];
    await yieldToEventLoop();
  };

  try {
    await parseCsvStream(stream, async (row, isMalformed) => {
      if (!headers) {
        headers = normalizeHeaders(row);
        validateHeaders(headers);
        return;
      }

      summary.total_rows++;

      if (isMalformed || row.length !== headers.length) {
        summary.skipped++;
        incrementReason(summary.reasons, "malformed_row");
        return;
      }

      const record = mapRow(headers, row);
      const validation = validateCsvRow(record, seenNames);

      if (!validation.ok) {
        summary.skipped++;
        incrementReason(summary.reasons, validation.reason);
        return;
      }

      validBatch.push(validation.profile);

      if (validBatch.length >= BATCH_SIZE) {
        await flushBatch();
      }

      if (summary.total_rows % YIELD_INTERVAL_ROWS === 0) {
        await yieldToEventLoop();
      }
    });

    await flushBatch();
    await db.flush();
    return summary;
  } catch (error) {
    await flushBatch();
    await db.flush();

    if (error instanceof CsvImportValidationError) {
      throw error;
    }

    return {
      ...summary,
      status: "error",
      message:
        error instanceof Error ? error.message : "Unexpected ingestion error",
    };
  }
}

async function parseCsvStream(
  stream: NodeJS.ReadableStream,
  onRow: (row: string[], isMalformed: boolean) => Promise<void>,
): Promise<void> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  let rowHasReplacementChar = false;

  const emitRow = async (isMalformed = false) => {
    currentRow.push(currentField);
    await onRow(
      currentRow.map((value) => trimBom(value)),
      isMalformed || rowHasReplacementChar,
    );
    currentField = "";
    currentRow = [];
    rowHasReplacementChar = false;
  };

  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const text =
      typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    buffer += text;

    let index = 0;
    while (index < buffer.length) {
      const character = buffer[index]!;

      if (character === "\uFFFD") {
        rowHasReplacementChar = true;
      }

      if (character === '"') {
        if (inQuotes) {
          if (index + 1 >= buffer.length) {
            break;
          }

          if (buffer[index + 1] === '"') {
            currentField += '"';
            index += 2;
            continue;
          }

          inQuotes = false;
          index++;
          continue;
        }

        if (currentField.length === 0) {
          inQuotes = true;
          index++;
          continue;
        }
      }

      if (!inQuotes && character === ",") {
        currentRow.push(currentField);
        currentField = "";
        index++;
        continue;
      }

      if (!inQuotes && character === "\n") {
        await emitRow();
        index++;
        continue;
      }

      if (!inQuotes && character === "\r") {
        if (index + 1 >= buffer.length) {
          break;
        }

        await emitRow();
        index += buffer[index + 1] === "\n" ? 2 : 1;
        continue;
      }

      currentField += character;
      index++;
    }

    buffer = buffer.slice(index);
  }

  buffer += decoder.decode();

  if (buffer.length > 0) {
    let index = 0;
    while (index < buffer.length) {
      const character = buffer[index]!;

      if (character === "\uFFFD") {
        rowHasReplacementChar = true;
      }

      if (character === '"') {
        if (inQuotes && buffer[index + 1] === '"') {
          currentField += '"';
          index += 2;
          continue;
        }

        inQuotes = !inQuotes;
        index++;
        continue;
      }

      if (!inQuotes && character === ",") {
        currentRow.push(currentField);
        currentField = "";
        index++;
        continue;
      }

      if (!inQuotes && (character === "\n" || character === "\r")) {
        await emitRow();
        if (character === "\r" && buffer[index + 1] === "\n") {
          index += 2;
        } else {
          index++;
        }
        continue;
      }

      currentField += character;
      index++;
    }

    buffer = buffer.slice(index);
  }

  if (inQuotes) {
    await emitRow(true);
    return;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    await emitRow();
  }
}

function normalizeHeaders(row: string[]): string[] {
  return row.map((header) => {
    const normalizedHeader = header
      .trim()
      .toLowerCase()
      .replace(/[ -]+/g, "_");

    return HEADER_ALIASES[normalizedHeader] ?? normalizedHeader;
  });
}

function validateHeaders(headers: string[]): void {
  const missingHeaders = REQUIRED_COLUMNS.filter(
    (requiredHeader) => !headers.includes(requiredHeader),
  );

  if (missingHeaders.length > 0) {
    throw new CsvImportValidationError(
      `Missing required columns: ${missingHeaders.join(", ")}`,
    );
  }
}

function mapRow(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};

  headers.forEach((header, index) => {
    record[header] = row[index]?.trim() ?? "";
  });

  return record;
}

function validateCsvRow(
  record: Record<string, string>,
  seenNames: Set<string>,
): { ok: true; profile: Profile } | { ok: false; reason: string } {
  const name = validateName(record.name);
  if (!name) {
    return { ok: false, reason: "missing_fields" };
  }

  const normalizedName = name.toLowerCase();
  if (seenNames.has(normalizedName) || db.hasProfileName(name)) {
    return { ok: false, reason: "duplicate_name" };
  }

  const gender = normalizeGender(record.gender);
  if (!gender) {
    return { ok: false, reason: "invalid_gender" };
  }

  const age = Number.parseInt(record.age, 10);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    return { ok: false, reason: "invalid_age" };
  }

  const countryId = record.country_id?.trim().toUpperCase();
  if (!countryId) {
    return { ok: false, reason: "missing_fields" };
  }

  if (!/^[A-Z]{2}$/.test(countryId) || !db.isKnownCountryCode(countryId)) {
    return { ok: false, reason: "invalid_country" };
  }

  const genderProbability = parseOptionalProbability(
    record.gender_probability,
    1,
    "invalid_gender_probability",
  );
  if (genderProbability.error) {
    return { ok: false, reason: genderProbability.error };
  }

  const countryProbability = parseOptionalProbability(
    record.country_probability,
    1,
    "invalid_country_probability",
  );
  if (countryProbability.error) {
    return { ok: false, reason: countryProbability.error };
  }

  const sampleSize = parseOptionalInteger(
    record.sample_size,
    0,
    "invalid_sample_size",
  );
  if (sampleSize.error) {
    return { ok: false, reason: sampleSize.error };
  }

  const createdAt = parseOptionalDate(record.created_at);
  if (!createdAt.ok) {
    return { ok: false, reason: "invalid_created_at" };
  }

  seenNames.add(normalizedName);

  return {
    ok: true,
    profile: {
      id: record.id || uuidv7(),
      name,
      gender,
      gender_probability: genderProbability.value,
      sample_size: sampleSize.value,
      age,
      age_group: getAgeGroup(age),
      country_id: countryId,
      country_name: db.getCountryName(countryId),
      country_probability: countryProbability.value,
      created_at: createdAt.value,
    },
  };
}

function normalizeGender(value: string): "male" | "female" | null {
  const normalized = value.trim().toLowerCase();

  if (["male", "man", "men", "m"].includes(normalized)) {
    return "male";
  }

  if (["female", "woman", "women", "f"].includes(normalized)) {
    return "female";
  }

  return null;
}

function parseOptionalProbability(
  value: string | undefined,
  fallback: number,
  reason: string,
): { value: number; error?: string } {
  if (!value) {
    return { value: fallback };
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return { value: fallback, error: reason };
  }

  return { value: parsed };
}

function parseOptionalInteger(
  value: string | undefined,
  fallback: number,
  reason: string,
): { value: number; error?: string } {
  if (!value) {
    return { value: fallback };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: fallback, error: reason };
  }

  return { value: parsed };
}

function parseOptionalDate(
  value: string | undefined,
): { ok: true; value: string } | { ok: false } {
  if (!value) {
    return { ok: true, value: new Date().toISOString() };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false };
  }

  return { ok: true, value: parsed.toISOString() };
}

function incrementReason(
  reasons: Record<string, number>,
  reason: string,
  count = 1,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + count;
}

function trimBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
