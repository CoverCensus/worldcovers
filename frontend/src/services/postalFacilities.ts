/**
 * Postal facilities: data from Supabase (now) or from GET /postal-facilities/ (future).
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
  /** State name from jurisdiction (for town dropdown filtering) */
  stateName?: string | null;
}

/** Paginated response from GET /postal-facilities/ */
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
  /** Optional structured fields when available (e.g. Supabase source) */
  town?: string;
  state?: string;
}

function mapApiResultToOption(item: PostalFacilitiesApiResultItem): PostalFacilityOption {
  return {
    id: item.postalFacilityId,
    referenceCode: item.referenceCode,
    name: item.currentName ?? "",
    type: item.currentType ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    town: (item.currentName ?? "").trim() || undefined,
    state: (item.stateName ?? "").trim() || undefined,
  };
}

function getPostalFacilitiesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/postal-facilities")) return base;
  return `${base}/postal-facilities`;
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
      town: town.trim(),
      state: state.trim(),
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

/** One item from GET /postal-facilities/town-options/ */
export interface TownOptionItem {
  town: string;
  state: string;
}

/**
 * Fetches postal facilities for dropdowns. When VITE_API_URL is set, uses
 * GET /postal-facilities/town-options/ (merged from facilities + postmarks).
 * Otherwise uses Supabase (distinct town + state from catalog_records and submissions).
 */
export async function getPostalFacilities(): Promise<PostalFacilityOption[]> {
  const apiUrl = getPostalFacilitiesApiUrl();
  if (apiUrl) {
    const base = apiUrl.replace(/\/+$/, "");
    const townOptionsUrl = `${base}/town-options/`;
    const res = await fetch(townOptionsUrl);
    if (!res.ok) {
      throw new Error(`Postal facilities API error: ${res.status} ${res.statusText}`);
    }
    const data: TownOptionItem[] = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("Postal facilities API: invalid town-options response");
    }
    return data.map((item, i) => ({
      id: i,
      referenceCode: "",
      name: `${item.town}, ${item.state}`,
      type: "",
      latitude: null,
      longitude: null,
      town: item.town.trim(),
      state: item.state.trim(),
    }));
  }

  return getPostalFacilitiesFromSupabase();
}
