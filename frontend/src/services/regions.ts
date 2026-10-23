/**
 * State options for filters/contribution forms.
 * Single source: GET /regions/ (supports assigned_only=true for State Editors).
 */
import apiClient from "@/lib/api";

/** One item from GET /regions/ (DRF snake_case) */
export interface RegionApiItem {
  region_id?: number;
  id?: number;
  abbrev?: string | null;
  name?: string | null;
  region_tier?: string | null;
  /** The parent Region's id as the API names it (RegionSerializer is fields="__all__"). */
  parent_region?: number | null;
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

type PagedApiResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

/**
 * Option for state filter dropdown. `value` is the region NAME: the submit
 * path, the catalog filters and stored drafts all speak names. `id` and
 * `abbrev` ride along for consumers that need the Region itself (T70: the
 * county list is fetched by the state's id).
 */
export interface StateOption {
  value: string;
  label: string;
  id?: number;
  abbrev?: string;
}

/** A county under one state, for the Marking form's County selector (T70). */
export interface CountyOption {
  id: number;
  name: string;
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

/**
 * Tiers that are a legitimate answer to "which state/territory?".
 *
 * An allowlist, unlike the backend's Region.SUBREGION_TIERS exclusion, because
 * this list also has to drop COUNTRY ("United States of America" is not a
 * state). The cost of that is the reminder below.
 *
 * ⚠ A future PROVINCE (Canada) must be added here or it will silently not
 * appear in the dropdown.
 *
 * Without this the endpoint returns every Region and the dropdown reads
 * "Accomack, Alabama, Alaska, Albemarle, Alexandria, Alleghany, Amelia…" --
 * 196 entries for 57 real jurisdictions, because the VPHC ingest added 141
 * county rows. (issue #103)
 */
export const STATE_SELECTOR_TIERS = ["STATE", "TERRITORY", "DISTRICT"] as const;

async function collectRegionRows(params: Record<string, string>): Promise<RegionApiItem[]> {
  const rows: RegionApiItem[] = [];
  let nextUrl: string | null = "/regions/";
  let useParams: Record<string, string> | undefined = params;
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get(nextUrl, {
      params: useParams,
      withCredentials: true,
    });
    const page = getResponseRows<RegionApiItem>(res.data);
    rows.push(...page.rows);
    nextUrl = page.next;
    useParams = undefined; // next URL already includes cursor/page
    safetyCounter += 1;
  }

  return rows;
}

function regionId(row: RegionApiItem): number | undefined {
  const raw = row.id ?? row.region_id;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Fetches regions from GET /regions/.
 * Follows pagination so the filter dropdown gets every region.
 * @param assignedOnly - when true, only regions assigned to the current State Editor.
 */
export async function getRegions(assignedOnly?: boolean): Promise<StateOption[]> {
  const params: Record<string, string> = {
    page_size: "500",
    region_tier__in: STATE_SELECTOR_TIERS.join(","),
  };
  if (assignedOnly) params.assigned_only = "true";
  const rows = await collectRegionRows(params);

  // One option per name; the first row supplies the id and abbreviation.
  const seen = new Set<string>();
  const options: StateOption[] = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const abbrev = String(row.abbrev ?? "").trim();
    options.push({ value: name, label: name, id: regionId(row), ...(abbrev ? { abbrev } : {}) });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * The COUNTY-tier Regions under one state, by the state's Region id (T70).
 * Asked of the API with the tier and parent filters, so the form never has to
 * sift the full region list client-side.
 */
export async function getCountyRegions(stateRegionId: number): Promise<CountyOption[]> {
  const rows = await collectRegionRows({
    page_size: "500",
    region_tier: "COUNTY",
    parent_region: String(stateRegionId),
  });
  const counties: CountyOption[] = [];
  for (const row of rows) {
    const id = regionId(row);
    const name = String(row.name ?? "").trim();
    if (id == null || !name) continue;
    counties.push({ id, name });
  }
  return counties.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Fetches only the regions assigned to the current user.
 */
export async function getAssignedRegions(): Promise<StateOption[]> {
  return getRegions(true);
}
