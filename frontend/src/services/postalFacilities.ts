/**
 * Postal facilities: data from Supabase (now) or from GET /api/postal-facilities/ (future).
 * - When VITE_POSTAL_FACILITIES_API_URL is set → fetch from API.
 * - When not set → derive from Supabase (distinct town + state from catalog_records and submissions).
 */

import { supabase } from "@/integrations/supabase/client";

/** One item from the external /api/postal-facilities/ response */
export interface PostalFacilitiesApiResultItem {
  postalFacilityId: number;
  referenceCode: string;
  currentName: string;
  currentType: string;
  latitude: number | null;
  longitude: number | null;
}

/** Paginated response from GET /api/postal-facilities/ */
export interface PostalFacilitiesApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostalFacilitiesApiResultItem[];
}

/** Normalized option for dropdowns/filters */
export interface PostalFacilityOption {
  id: number;
  referenceCode: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
}

function mapApiResultToOption(item: PostalFacilitiesApiResultItem): PostalFacilityOption {
  return {
    id: item.postalFacilityId,
    referenceCode: item.referenceCode,
    name: item.currentName,
    type: item.currentType,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

function getPostalFacilitiesApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTAL_FACILITIES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postal-facilities")) return base;
  return `${base}/api/postal-facilities`;
}

/**
 * Fetches distinct (town, state) from Supabase catalog_records and submissions.
 * Mapped to PostalFacilityOption with id = index, name = "Town, State", referenceCode = "", type = "".
 */
async function getPostalFacilitiesFromSupabase(): Promise<PostalFacilityOption[]> {
  const seen = new Set<string>();
  const options: PostalFacilityOption[] = [];

  const add = (town: string, state: string) => {
    const key = `${town.trim().toLowerCase()}|${state.trim().toLowerCase()}`;
    if (!town.trim() || !state.trim() || seen.has(key)) return;
    seen.add(key);
    options.push({
      id: options.length,
      referenceCode: "",
      name: `${town.trim()}, ${state.trim()}`,
      type: "",
      latitude: null,
      longitude: null,
    });
  };

  const { data: catalogData } = await supabase
    .from("catalog_records")
    .select("town, state");

  const { data: submissionData } = await supabase
    .from("submissions")
    .select("town, state");

  for (const row of catalogData ?? []) {
    if (row?.town != null && row?.state != null) add(String(row.town), String(row.state));
  }
  for (const row of submissionData ?? []) {
    if (row?.town != null && row?.state != null) add(String(row.town), String(row.state));
  }

  options.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return options.map((o, i) => ({ ...o, id: i }));
}

/**
 * Fetches postal facilities. When VITE_POSTAL_FACILITIES_API_URL is set, uses GET /api/postal-facilities/.
 * Otherwise uses Supabase (distinct town + state from catalog_records and submissions).
 */
export async function getPostalFacilities(): Promise<PostalFacilityOption[]> {
  const apiUrl = getPostalFacilitiesApiUrl();
  if (apiUrl) {
    const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postal facilities API error: ${res.status} ${res.statusText}`);
    }
    const data: PostalFacilitiesApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Postal facilities API: invalid response (missing results array)");
    }
    return data.results.map(mapApiResultToOption);
  }

  return getPostalFacilitiesFromSupabase();
}
