/**
 * Regions (v2 Region entity, tier STATE/COUNTY/etc.): GET /regions/.
 * Used for state filter options in Search and contributor state assignments.
 */
import apiClient from "@/lib/api";

/** One item from GET /regions/ (DRF snake_case) */
export interface RegionApiItem {
  region_id?: number;
  id?: number;
  abbrev?: string | null;
  name?: string | null;
  region_tier?: string | null;
  parent_region_id?: number | null;
  established_date?: string | null;
  defunct_date?: string | null;
}

/** Paginated response from GET /regions/ */
export interface RegionsApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RegionApiItem[];
}

/** Option for state filter dropdown */
export interface StateOption {
  value: string;
  label: string;
}

/**
 * Fetches regions from GET /regions/.
 * Follows pagination so the filter dropdown gets every region.
 * @param assignedOnly - when true, only regions assigned to the current user.
 */
export async function getRegions(assignedOnly?: boolean): Promise<StateOption[]> {
  const allResults: RegionApiItem[] = [];
  const params: Record<string, string> = { page_size: "500" };
  if (assignedOnly) params.assigned_only = "true";

  let nextUrl: string | null = "/regions/";
  let useParams: Record<string, string> | undefined = params;
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get<RegionsApiResponse>(nextUrl, {
      params: useParams,
      withCredentials: true,
    });
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Regions API: invalid response (missing results array)");
    }
    allResults.push(...data.results);
    nextUrl = data.next;
    useParams = undefined; // next URL already has pagination cursor
    safetyCounter += 1;
  }

  const seen = new Set<string>();
  return allResults
    .map((u) => String(u.name ?? "").trim())
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * Fetches only the regions assigned to the current user.
 */
export async function getAssignedRegions(): Promise<StateOption[]> {
  const res = await apiClient.get<Array<{ value: string; label?: string }>>(
    "/assigned-states/",
    { withCredentials: true }
  );
  const data = res.data;
  if (!Array.isArray(data)) {
    throw new Error("Assigned regions API: invalid response");
  }
  return data
    .filter((item) => item && typeof item.value === "string")
    .map((item) => ({
      value: item.value,
      label: item.label || item.value,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}
