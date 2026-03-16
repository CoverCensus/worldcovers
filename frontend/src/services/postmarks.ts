export interface PostmarkApiResponse {
    /** Total count; null when include_count=false for faster response */
    count: number | null;
    next: string | null;
    previous: string | null;
    results: any | [];
    /** True when count was capped for performance (e.g. 10,001+) */
    count_capped?: boolean;
  }
  
  /** Normalized postmark for list/detail (matches API shape) */
  export interface PostmarkRecord {
    id: number;
    postmarkKey: string;
    facilityName: string;
    shapeName: string;
    rateLocation: string;
    rateValue: string;
    colorsDisplay: string,
    state: string,
    dateRange: string,
    town: string,
    sizeDisplay?: string,
    isManuscript: boolean;
    mainImage: string | null;
    responsibleGroups: unknown[];
  }
  
  /** Normalize image URL to absolute using the API origin when needed. */
  export function normalizeImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    // Already absolute
    if (/^https?:\/\//i.test(path)) return path;
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) return path;
    try {
      const url = new URL(apiUrl);
      const relative = path.startsWith("/") ? path : `/${path}`;
      return `${url.origin}${relative}`;
    } catch {
      return path;
    }
  }
  
  /** Normalize API item (snake_case or camelCase) to PostmarkRecord. */
  function mapApiResultToRecord(item: any): PostmarkRecord {
    const id = item.postmark_id ?? item.postmarkId;
    const facilityName = item.facility_name ?? item.facilityName;
    const shapeName = item.shape_name ?? item.shapeName;
    const mainImage = item.main_image ?? item.mainImage;
    const colorsDisplay = item.colors_display ?? item.colorsDisplay;
    const dateRange = item.date_range ?? item.dateRange;
    const sizeDisplayApi = item.size_display ?? item.sizeDisplay ?? item.sizeNotes;
    // Derive a human-readable size string from various possible fields
    let sizeDisplay: string | undefined = sizeDisplayApi || "";
    if (!sizeDisplay && Array.isArray(item.sizes) && item.sizes.length > 0) {
      const firstSize = item.sizes[0];
      const w = firstSize?.width;
      const h = firstSize?.height;
      if (w && h) {
        sizeDisplay = `${w}×${h} mm`;
      } else if (w) {
        sizeDisplay = `${w} mm`;
      } else if (h) {
        sizeDisplay = `${h} mm`;
      }
    }
  
    return {
      id,
      postmarkKey: item.postmark_key ?? item.postmarkKey,
      facilityName: facilityName ?? "",
      shapeName: shapeName ?? "",
      rateLocation: item.rate_location ?? item.rateLocation,
      rateValue: item.rate_value ?? item.rateValue,
      isManuscript: item.is_manuscript ?? item.isManuscript,
      mainImage: mainImage ?? null,
      colorsDisplay: colorsDisplay ?? "",
      state: item.state ?? "",
      dateRange: dateRange ?? "",
      town: item.town ?? "",
      sizeDisplay,
      responsibleGroups: item.responsible_groups ?? item.responsibleGroups ?? [],
    };
  }

  /**
   * Fetches a single page of catalog entries for the current user's assigned states.
   * Used by state editors to manage (view, edit, delete) all catalog entries in their states.
   * Requires authentication; returns paginated results.
   * Optional filters match catalog list (state, town, type/postmark_shape, color, search).
   */
  export async function getAssignedCatalogPage(
    page: number = 1,
    pageSize: number = 10,
    options?: {
      credentials?: RequestCredentials;
      filters?: { state?: string; town?: string; type?: string; color?: string; search?: string };
    }
  ): Promise<GetPostmarksPageResult> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      return { results: [], count: 0, next: null, previous: null };
    }
    const base = apiUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const f = options?.filters;
    if (f?.state && f.state !== "all") params.set("state", f.state);
    if (f?.town?.trim()) params.set("town", f.town.trim());
    if (f?.type && f.type !== "all") params.set("postmark_shape", f.type);
    if (f?.color && f.color !== "all") params.set("color", f.color);
    if (f?.search?.trim()) params.set("search", f.search.trim());
    const url = `${base}/my-assigned/?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      credentials: options?.credentials ?? "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Assigned catalog API error: ${res.status} ${res.statusText}`);
    }
    const data: PostmarkApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Assigned catalog API: invalid response (missing results array)");
    }
    return {
      results: data.results.map(mapApiResultToRecord),
      count: data.count ?? null,
      next: data.next ?? null,
      previous: data.previous ?? null,
      count_capped: data.count_capped,
    };
  }
  
  function getPostmarksApiUrl(): string | null {
    const env = import.meta.env.VITE_API_URL;
    if (!env || typeof env !== "string" || env.trim() === "") return null;
    const base = env.trim().replace(/\/+$/, "");
    if (base.endsWith("/api/postmarks")) return base;
    return `${base}/api/postmarks`;
  }
  
  /**
   * Fetches a single postmark by ID from GET /api/postmarks/{postmarkId}/.
   * Returns null if API is not configured or request fails.
   */
  export async function getPostmarkById(postmarkId: number): Promise<any | null> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) return null;
  
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/${postmarkId}/`;
    const res = await fetch(url);
    if (!res.ok) return null;
  
    const data = await res.json();
    return data;
  }
  
  /**
   * Fetches postmarks from GET /api/postmarks/.
   * When VITE_POSTMARKS_API_URL is not set, returns [] (app uses Supabase catalog_records).
   */
  export async function getPostmarks(): Promise<PostmarkRecord[]> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      return [];
    }
  
    const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postmarks API error: ${res.status} ${res.statusText}`);
    }
  
    const data: PostmarkApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Postmarks API: invalid response (missing results array)");
    }
  
    return data.results.map(mapApiResultToRecord);
  }
  
  /** Paginated result from getPostmarksPage */
  export interface GetPostmarksPageResult {
    results: PostmarkRecord[];
    /** Total count; null when include_count=false */
    count: number | null;
  next: string | null;
  previous: string | null;
    count_capped?: boolean;
  }
  
  /**
   * Fetches a single page of postmarks from api/postmarks/.
   * 10 records per page. Use page=2 for next 10 records.
   * Pass search to filter by keyword (postmark_key, facility_name, rate_value, etc).
   * Pass postmarkShapeId to filter by postmark type (sends postmark_shape=id to API).
   */
  export async function getPostmarksPage(
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    postmarkShapeId?: string | number,
    excludeManuscripts?: boolean,
    color?: string,
    state?: string,
    town?: string,
    beginYear?: string,
    endYear?: string,
    hasImages?: boolean,
    /** When true, skips slow COUNT query for faster first load (count will be null) */
    deferCount?: boolean
  ): Promise<GetPostmarksPageResult> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
    return { results: [], count: 0, next: null, previous: null };
    }
  
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search?.trim()) params.set("search", search.trim());
    if (postmarkShapeId != null && postmarkShapeId !== "" && String(postmarkShapeId) !== "all") {
      params.set("postmark_shape", String(postmarkShapeId));
    }
    if (excludeManuscripts) {
      params.set("is_manuscript", String(excludeManuscripts));
    }
    if (color !== "all" && color !== null && color !== "") {
      params.set("color", color);
    }
    if (state !== "all" && state != null && state !== "") {
      params.set("state", state.trim());
    }
    if (town != null && town.trim() !== "") {
      params.set("town", town.trim());
    }
    const begin = beginYear?.trim();
    if (begin !== undefined && begin !== "") {
      params.set("earliest_use_year_min", begin);
    }
    const end = endYear?.trim();
    if (end !== undefined && end !== "") {
      params.set("latest_use_year_max", end);
    }
    if (hasImages === true) {
      params.set("has_images", "true");
    }
    if (deferCount === true) {
      params.set("include_count", "false");
    }
    const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const url = `${base}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postmarks API error: ${res.status} ${res.statusText}`);
    }
  
    const data: PostmarkApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Postmarks API: invalid response (missing results array)");
    }
  
    return {
      results: data.results.map(mapApiResultToRecord),
      count: data.count,
    next: data.next,
    previous: data.previous,
      count_capped: data.count_capped,
    };
  }
