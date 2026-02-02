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
    responsibleGroups: item.responsibleGroups ?? [],
  };
}

function getPostmarksApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTMARKS_API_URL;
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
