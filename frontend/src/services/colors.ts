/**
 * Colors service: color options come from Supabase (now) or from GET /api/colors/ (future).
 * - When VITE_COLORS_API_URL is set → fetch from API (count, next, previous, results).
 * - When not set → derive distinct colors from Supabase catalog_records and submissions.
 */

import { supabase } from "@/integrations/supabase/client";

/** One item from the external /api/colors/ response */
export interface ColorsApiResultItem {
  colorId: number;
  createdDate: string;
  modifiedDate: string;
  colorName: string;
  colorValue: string;
  createdBy: number;
  modifiedBy: number;
}

/** Paginated response from GET /api/colors/ */
export interface ColorsApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ColorsApiResultItem[];
}

/** Normalized color used in the app (dropdowns, filters) */
export interface ColorOption {
  id: number;
  name: string;
  value: string; // hex from API, or "" when from Supabase
}

function mapApiResultToOption(item: ColorsApiResultItem): ColorOption {
  return {
    id: item.colorId,
    name: item.colorName,
    value: item.colorValue,
  };
}

/**
 * Base URL for the colors API.
 * VITE_COLORS_API_URL can be the full path (e.g. https://api.example.com/api/colors)
 * or just the origin (we append /api/colors).
 */
function getColorsApiUrl(): string | null {
  const env = import.meta.env.VITE_COLORS_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/colors")) return base;
  return `${base}/api/colors`;
}

/**
 * Fetches distinct colors from Supabase (catalog_records + submissions).
 * Returns ColorOption[] with id = index, name = color string, value = "".
 */
async function getColorsFromSupabase(): Promise<ColorOption[]> {
  const colors = new Set<string>();

  const { data: catalogColors } = await supabase
    .from("catalog_records")
    .select("color");

  const { data: submissionColors } = await supabase
    .from("submissions")
    .select("color");

  for (const row of catalogColors ?? []) {
    if (row?.color && String(row.color).trim()) colors.add(String(row.color).trim());
  }
  for (const row of submissionColors ?? []) {
    if (row?.color && String(row.color).trim()) colors.add(String(row.color).trim());
  }

  return Array.from(colors)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name, index) => ({ id: index, name, value: "" }));
}

/**
 * Fetches color options. When VITE_COLORS_API_URL is set, uses GET /api/colors/.
 * Otherwise uses Supabase (distinct colors from catalog_records and submissions).
 */
export async function getColors(): Promise<ColorOption[]> {
  const apiUrl = getColorsApiUrl();
  if (apiUrl) {
    const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Colors API error: ${res.status} ${res.statusText}`);
    }
    const data: ColorsApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Colors API: invalid response (missing results array)");
    }
    return data.results.map(mapApiResultToOption);
  }

  return getColorsFromSupabase();
}
