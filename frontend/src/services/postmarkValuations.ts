/**
 * Postmark valuations: from GET /api/postmark-valuations/ when
 * VITE_POSTMARK_VALUATIONS_API_URL is set. No Supabase fallback (no matching table).
 */

/** User object in valuedBy */
export interface PostmarkValuationUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** One item from GET /api/postmark-valuations/ */
export interface PostmarkValuationApiResultItem {
  postmarkValuationId: number;
  valuedBy: PostmarkValuationUser;
  estimatedValue: string;
  valuationDate: string;
  createdDate: string;
}

/** Paginated response from GET /api/postmark-valuations/ */
export interface PostmarkValuationApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostmarkValuationApiResultItem[];
}

/** Normalized valuation for list/detail */
export interface PostmarkValuationRecord {
  id: number;
  valuedBy: PostmarkValuationUser;
  estimatedValue: string;
  valuationDate: string;
  createdDate: string;
}

function mapApiResultToRecord(
  item: PostmarkValuationApiResultItem
): PostmarkValuationRecord {
  return {
    id: item.postmarkValuationId,
    valuedBy: item.valuedBy,
    estimatedValue: item.estimatedValue,
    valuationDate: item.valuationDate,
    createdDate: item.createdDate,
  };
}

function getPostmarkValuationsApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTMARK_VALUATIONS_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postmark-valuations")) return base;
  return `${base}/api/postmark-valuations`;
}

/**
 * Fetches postmark valuations from GET /api/postmark-valuations/.
 * When VITE_POSTMARK_VALUATIONS_API_URL is not set, returns [].
 */
export async function getPostmarkValuations(): Promise<
  PostmarkValuationRecord[]
> {
  const apiUrl = getPostmarkValuationsApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Postmark valuations API error: ${res.status} ${res.statusText}`
    );
  }

  const data: PostmarkValuationApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Postmark valuations API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
