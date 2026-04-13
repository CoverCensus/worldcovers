/**
 * Colors (v2 Color entity): GET /colors/.
 */
import apiClient from "@/lib/api";

/** One item from the /colors/ response (supports legacy + v2 field names) */
export interface ColorsApiResultItem {
  colorId?: number;
  createdDate?: string;
  modifiedDate?: string;
  colorName?: string;
  colorValue?: string;
  createdBy?: number;
  modifiedBy?: number;
  color_id?: number;
  color_name?: string;
  color_value?: string;
  id?: number;
  name?: string;
  value?: string | null;
}

/** Paginated response from GET /colors/ */
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
  value: string;
}

function mapApiResultToOption(item: ColorsApiResultItem): ColorOption {
  return {
    id: item.colorId ?? item.color_id ?? item.id ?? 0,
    name: item.colorName ?? item.color_name ?? item.name ?? "",
    value: item.colorValue ?? item.color_value ?? item.value ?? "",
  };
}

/**
 * Fetches all pages of v2 colors.
 */
export async function getColors(): Promise<ColorOption[]> {
  const allResults: ColorOption[] = [];
  let nextUrl: string | null = "/colors/";
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get<ColorsApiResponse>(nextUrl);
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Colors API: invalid response (missing results array)");
    }
    allResults.push(...data.results.map(mapApiResultToOption));
    nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults.filter((x) => x.id > 0 && x.name.trim() !== "");
}
