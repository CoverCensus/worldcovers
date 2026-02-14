/**
 * Colors: from Django GET /api/colors/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/colors/ (camelCase from Django) */
export interface ColorsApiResultItem {
  colorId: number;
  createdDate?: string;
  modifiedDate?: string;
  colorName: string;
  colorValue: string;
  createdBy?: number;
  modifiedBy?: number;
}

/** Normalized color used in the app (dropdowns, filters) */
export interface ColorOption {
  id: number;
  name: string;
  value: string;
}

function mapApiResultToOption(item: ColorsApiResultItem): ColorOption {
  return {
    id: item.colorId,
    name: item.colorName,
    value: item.colorValue || "",
  };
}

/**
 * Fetches color options from Django GET /api/colors/.
 * Uses the shared API base URL (VITE_API_BASE_URL).
 */
export async function getColors(): Promise<ColorOption[]> {
  const results = await fetchAllPages<ColorsApiResultItem>("colors");
  return results.map(mapApiResultToOption);
}
