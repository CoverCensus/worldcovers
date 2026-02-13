/**
 * Postcovers: from Django GET /api/postcovers/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/postcovers/ (camelCase or snake_case) */
export interface PostcoverApiResultItem {
  postcoverId?: number;
  postcover_id?: number;
  postcoverKey?: string;
  postcover_key?: string;
  ownerUsername?: string;
  owner_username?: string;
  postmarkCount?: number;
  postmark_count?: number;
  createdDate?: string;
  created_date?: string;
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
  const id = item.postcoverId ?? item.postcover_id ?? 0;
  return {
    id,
    postcoverKey: item.postcoverKey ?? item.postcover_key ?? "",
    ownerUsername: item.ownerUsername ?? item.owner_username ?? "",
    postmarkCount: item.postmarkCount ?? item.postmark_count ?? 0,
    createdDate: item.createdDate ?? item.created_date ?? "",
  };
}

/**
 * Fetches postcovers from Django GET /api/postcovers/.
 */
export async function getPostcovers(): Promise<PostcoverRecord[]> {
  const results = await fetchAllPages<PostcoverApiResultItem>("postcovers");
  return results.map(mapApiResultToRecord);
}
