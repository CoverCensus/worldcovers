/**
 * Covers (v2 Cover entity): GET /covers/.
 */
import apiClient from "@/lib/api";

/** One item from GET /covers/ (DRF snake_case) */
export interface CoverApiResultItem {
  cover_id: number;
  cover_key: string;
  owner_username: string;
  postmark_count: number;
  created_date: string;
}

/** Paginated response from GET /covers/ */
export interface CoverApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CoverApiResultItem[];
}

/** Normalized cover for list/detail */
export interface CoverRecord {
  id: number;
  coverKey: string;
  ownerUsername: string;
  postmarkCount: number;
  createdDate: string;
}

function mapApiResultToRecord(item: CoverApiResultItem): CoverRecord {
  return {
    id: item.cover_id,
    coverKey: item.cover_key,
    ownerUsername: item.owner_username,
    postmarkCount: item.postmark_count,
    createdDate: item.created_date,
  };
}

/**
 * Fetches covers from GET /covers/.
 */
export async function getCovers(): Promise<CoverRecord[]> {
  const res = await apiClient.get<CoverApiResponse>("/covers/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Covers API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
