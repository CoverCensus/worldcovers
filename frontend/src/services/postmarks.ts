/**
 * Postmarks (catalog): from GET /api/postmarks/ when VITE_POSTMARKS_API_URL is set.
 * When not set, the app uses Supabase catalog_records for the catalog list.
 */

/** One item from GET /api/postmarks/ */
export interface PostmarkApiResultItem {
  postmarkId: number;
  postmarkKey: string;
  facilityName: string;
  shapeName: string;
  rateLocation: string;
  rateValue: string;
  colorsDisplay: string,
  state: string,
  dateRange: string,
  town: string,
  isManuscript: boolean;
  mainImage: string | null;
  responsibleGroups: unknown[];
}

/** Paginated response from GET /api/postmarks/ */
export interface PostmarkApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostmarkApiResultItem[];
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
  isManuscript: boolean;
  mainImage: string | null;
  responsibleGroups: unknown[];
}

function mapApiResultToRecord(item: PostmarkApiResultItem): PostmarkRecord {
  return {
    id: item.postmarkId,
    postmarkKey: item.postmarkKey,
    facilityName: item.facilityName,
    shapeName: item.shapeName,
    rateLocation: item.rateLocation,
    rateValue: item.rateValue,
    isManuscript: item.isManuscript,
    mainImage: item.mainImage,
    colorsDisplay: item.colorsDisplay,
    state: item.state,
    dateRange: item.dateRange,
    town: item.town,
    responsibleGroups: item.responsibleGroups ?? [],
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
  count: number;
  next: string | null;
  previous: string | null;
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
  color?: string
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
  // if (color !== "all" && color !== null && color !== "") {
  //   params.set("color", color);
  // }
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
  };
}
