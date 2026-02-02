/**
 * Postcovers: from GET /api/postcovers/ when VITE_POSTCOVERS_API_URL is set.
 * When not set, returns [] (app may use Supabase or other source for covers).
 */

/** One item from GET /api/postcovers/ */
export interface PostcoverApiResultItem {
  postcoverId: number;
  postcoverKey: string;
  ownerUsername: string;
  postmarkCount: number;
  createdDate: string;
}

/** Paginated response from GET /api/postcovers/ */
export interface PostcoverApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostcoverApiResultItem[];
}

/** Normalized postcover for list/detail */
export interface PostcoverRecord {
  id: number;
  postcoverKey: string;
  ownerUsername: string;
  postmarkCount: number;
  createdDate: string;
}

function mapApiResultToRecord(item: PostcoverApiResultItem): PostcoverRecord {
  return {
    id: item.postcoverId,
    postcoverKey: item.postcoverKey,
    ownerUsername: item.ownerUsername,
    postmarkCount: item.postmarkCount,
    createdDate: item.createdDate,
  };
}

function getPostcoversApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTCOVERS_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postcovers")) return base;
  return `${base}/api/postcovers`;
}

/**
 * Fetches postcovers from GET /api/postcovers/.
 * When VITE_POSTCOVERS_API_URL is not set, returns [].
 */
export async function getPostcovers(): Promise<PostcoverRecord[]> {
  const apiUrl = getPostcoversApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Postcovers API error: ${res.status} ${res.statusText}`);
  }

  const data: PostcoverApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Postcovers API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
