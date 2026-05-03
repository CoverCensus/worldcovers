import apiClient from "@/lib/api";

/** One item from the external /api/post-offices/ response */
export interface PostOfficeApiResultItem {
  post_office_id: number;
  reference_code: string;
  current_name: string;
  current_type: string;
  latitude: number | null;
  longitude: number | null;
  /** State/region name (for town dropdown filtering) */
  state_name?: string | null;
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
  town?: string;
  state?: string;
}

function mapApiResultToOption(item: PostOfficeApiResultItem): PostOfficeOption {
  return {
    id: item.post_office_id,
    referenceCode: item.reference_code,
    name: item.current_name ?? "",
    type: item.current_type ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    town: (item.current_name ?? "").trim() || undefined,
    state: (item.state_name ?? "").trim() || undefined,
  };
}

/** One item from GET /post-offices/town-options/ */
export interface TownOptionItem {
  town: string;
  state: string;
}

interface PostOfficesV2Item {
  id?: number;
  name?: string;
  region_name?: string;
  regionName?: string;
}

interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}

function dedupeTownState(options: PostOfficeOption[]): PostOfficeOption[] {
  const seen = new Set<string>();
  const out: PostOfficeOption[] = [];
  for (const option of options) {
    const town = (option.town ?? "").trim();
    const state = (option.state ?? "").trim();
    if (!town) continue;
    const key = `${town.toLowerCase()}|${state.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...option,
      town,
      state,
      name: `${town}${state ? `, ${state}` : ""}`,
    });
  }
  return out;
}

function mapTownOptionsPayload(data: unknown): PostOfficeOption[] {
  if (!Array.isArray(data)) return [];
  return dedupeTownState(
    data
      .map((item, i) => {
        const row = item as Partial<TownOptionItem>;
        const town = (row.town ?? "").trim();
        const state = (row.state ?? "").trim();
        if (!town) return null;
        return {
          id: i,
          referenceCode: "",
          name: `${town}${state ? `, ${state}` : ""}`,
          type: "",
          latitude: null,
          longitude: null,
          town,
          state,
        } as PostOfficeOption;
      })
      .filter((item): item is PostOfficeOption => Boolean(item))
  );
}

function mapPaginatedPostOfficesPayload(data: unknown): PostOfficeOption[] {
  const payload = data as PaginatedResponse<PostOfficesV2Item>;
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return dedupeTownState(
    results
      .map((item, i) => {
        const town = (item?.name ?? "").trim();
        const state = (item?.region_name ?? item?.regionName ?? "").trim();
        if (!town) return null;
        return {
          id: typeof item?.id === "number" ? item.id : i,
          referenceCode: "",
          name: `${town}${state ? `, ${state}` : ""}`,
          type: "",
          latitude: null,
          longitude: null,
          town,
          state,
        } as PostOfficeOption;
      })
      .filter((item): item is PostOfficeOption => Boolean(item))
  );
}

/** Returns the total number of post office records from the paginated list endpoint. */
export async function getPostOfficeCount(): Promise<number> {
  const res = await apiClient.get<PostOfficesApiResponse>("/post-offices/", {
    params: { page_size: "1" },
  });
  return typeof res.data.count === "number" ? res.data.count : 0;
}

/** Fetches post office town options from GET /post-offices/town-options/. */
export async function getPostOffices(): Promise<PostOfficeOption[]> {
  try {
    const res = await apiClient.get<TownOptionItem[]>("/post-offices/town-options/");
    const fromTownOptions = mapTownOptionsPayload(res.data);
    if (fromTownOptions.length > 0) {
      return fromTownOptions;
    }
  } catch {
    // Fallback below keeps forms functional when town-options endpoint is unavailable.
  }

  const fallbackRes = await apiClient.get<PaginatedResponse<PostOfficesV2Item>>("/post-offices/", {
    params: { page_size: "5000" },
  });
  const fromPostOffices = mapPaginatedPostOfficesPayload(fallbackRes.data);
  if (fromPostOffices.length > 0) {
    return fromPostOffices;
  }

  throw new Error("Could not load town/city options.");
}
