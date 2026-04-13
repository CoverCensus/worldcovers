/**
 * Post offices (v2 PostOffice entity): data from Supabase (now) or from GET /post-offices/ (future).
 * - When VITE_API_URL is set → fetch from API via /post-offices/town-options/.
 * - When not set → derive from Supabase (distinct town + state from catalog_records and submissions).
 *
 * Note: the v2 PostOffice entity itself is narrow (id, name, region_id). The richer
 * fields below (referenceCode, type, latitude, longitude) are extensions kept for
 * existing UI use until the town-options aggregate on the backend moves to v2 shape.
 */

import apiClient from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

/** One item from the external /api/post-offices/ response */
export interface PostOfficeApiResultItem {
  postOfficeId: number;
  referenceCode: string;
  currentName: string;
  currentType: string;
  latitude: number | null;
  longitude: number | null;
  /** State/region name (for town dropdown filtering) */
  stateName?: string | null;
}

/** Paginated response from GET /post-offices/ */
export interface PostOfficesApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostOfficeApiResultItem[];
}

/** Normalized option for dropdowns/filters */
export interface PostOfficeOption {
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

function mapApiResultToOption(item: PostOfficeApiResultItem): PostOfficeOption {
  return {
    id: item.postOfficeId,
    referenceCode: item.referenceCode,
    name: item.currentName ?? "",
    type: item.currentType ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    town: (item.currentName ?? "").trim() || undefined,
    state: (item.stateName ?? "").trim() || undefined,
  };
}

/**
 * Fetches distinct (town, state) from Supabase catalog_records and submissions.
 * Mapped to PostOfficeOption with id = index, name = "Town, State", referenceCode = "", type = "".
 */
async function getPostOfficesFromSupabase(): Promise<PostOfficeOption[]> {
  const seen = new Set<string>();
  const options: PostOfficeOption[] = [];

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

/** One item from GET /post-offices/town-options/ */
export interface TownOptionItem {
  town: string;
  state: string;
}

/**
 * Fetches post offices for dropdowns. When VITE_API_URL is set, uses
 * GET /post-offices/town-options/ (merged from offices + postmarks).
 * Otherwise uses Supabase (distinct town + state from catalog_records and submissions).
 */
export async function getPostOffices(): Promise<PostOfficeOption[]> {
  try {
    const res = await apiClient.get<TownOptionItem[]>("/post-offices/town-options/");
    const data = res.data;
    if (!Array.isArray(data)) {
      throw new Error("Post offices API: invalid town-options response");
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
  } catch {
    return getPostOfficesFromSupabase();
  }
}
