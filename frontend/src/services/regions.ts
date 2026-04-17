/**
 * State options for filters/contribution forms.
 * Primary source: GET /administrative-units/ (supports assigned_only=true).
 * Legacy fallback (non-assigned requests only): GET /regions/.
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

interface AdministrativeUnitApiItem {
  administrative_unit_id?: number;
  reference_code?: string | null;
  current_name?: string | null;
  current_type?: string | null;
  name?: string | null;
}

type PagedApiResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

/** Option for state filter dropdown */
export interface StateOption {
  value: string;
  label: string;
}

function getResponseRows<T>(data: unknown): { rows: T[]; next: string | null } {
  if (Array.isArray(data)) {
    return { rows: data as T[], next: null };
  }
  const paged = data as PagedApiResponse<T> | null;
  if (paged && Array.isArray(paged.results)) {
    const next =
      typeof paged.next === "string" && paged.next.trim() !== "" ? paged.next : null;
    return { rows: paged.results, next };
  }
  throw new Error("State options API: invalid response (missing results array)");
}

async function collectStateNamesFromEndpoint(
  endpoint: string,
  assignedOnly: boolean,
  extractName: (row: unknown) => string,
): Promise<string[]> {
  const names: string[] = [];
  const params: Record<string, string> = { page_size: "500" };
  if (assignedOnly) params.assigned_only = "true";

  let nextUrl: string | null = endpoint;
  let useParams: Record<string, string> | undefined = params;
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get(nextUrl, {
      params: useParams,
      withCredentials: true,
    });
    const { rows, next } = getResponseRows<unknown>(res.data);
    rows.forEach((row) => {
      const name = extractName(row).trim();
      if (name) names.push(name);
    });
    nextUrl = next;
    useParams = undefined; // next URL already includes cursor/page
    safetyCounter += 1;
  }

  return names;
}

/**
 * Fetches regions from GET /regions/.
 * Follows pagination so the filter dropdown gets every region.
 * @param assignedOnly - when true, only regions assigned to the current user.
 */
export async function getRegions(assignedOnly?: boolean): Promise<StateOption[]> {
  const collectedNames: string[] = [];

  try {
    const administrativeUnitNames = await collectStateNamesFromEndpoint(
      "/administrative-units/",
      Boolean(assignedOnly),
      (row) => {
        const item = row as AdministrativeUnitApiItem;
        return String(item.current_name ?? item.name ?? "").trim();
      },
    );
    collectedNames.push(...administrativeUnitNames);
  } catch (err) {
    // For assigned-only queries we need to surface auth/API failures.
    if (assignedOnly) {
      throw err;
    }
    // Non-assigned filters can fallback to legacy /regions.
  }

  // Legacy fallback only for non-assigned requests.
  if (!assignedOnly && collectedNames.length === 0) {
    const regionNames = await collectStateNamesFromEndpoint("/regions/", false, (row) => {
      const item = row as RegionApiItem;
      return String(item.name ?? "").trim();
    });
    collectedNames.push(...regionNames);
  }

  const seen = new Set<string>();
  return collectedNames
    .map((name) => String(name).trim())
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * Fetches only the states assigned to the current user.
 */
export async function getAssignedRegions(): Promise<StateOption[]> {
  return getRegions(true);
}
