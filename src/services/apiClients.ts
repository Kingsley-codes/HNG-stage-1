// src/services/apiClients.ts
import {
  GenderizeResponse,
  AgifyResponse,
  NationalizeResponse,
} from "../types/index.js";

async function fetchWithTimeout(
  url: string,
  timeout = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function fetchGender(name: string): Promise<GenderizeResponse> {
  const url = `https://api.genderize.io?name=${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Genderize API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.gender === null || data.count === 0) {
    throw new Error("Genderize returned invalid response");
  }

  return data;
}

export async function fetchAge(name: string): Promise<AgifyResponse> {
  const url = `https://api.agify.io?name=${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Agify API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.age === null) {
    throw new Error("Agify returned invalid response");
  }

  return data;
}

export async function fetchNationality(
  name: string,
): Promise<NationalizeResponse> {
  const url = `https://api.nationalize.io?name=${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Nationalize API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.country || data.country.length === 0) {
    throw new Error("Nationalize returned invalid response");
  }

  return data;
}
