/**
 * Postmarks (catalog): from Django GET /api/postmarks/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from GET /api/postmarks/ list (camelCase or snake_case from Django) */
export interface PostmarkApiResultItem {
  postmark_id?: number;
  postmarkId?: number;
  postmark_key?: string;
  postmarkKey?: string;
  facility_name?: string;
  facilityName?: string;
  shape_name?: string;
  shapeName?: string;
  rate_location?: string;
  rateLocation?: string;
  rate_value?: string;
  rateValue?: string;
  is_manuscript?: boolean;
  isManuscript?: boolean;
  main_image?: { image_url?: string | null } | null;
  mainImage?: string | null;
  responsible_groups?: unknown[];
  responsibleGroups?: unknown[];
}

/** Normalized postmark for list/detail */
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
  const id = item.postmark_id ?? item.postmarkId ?? 0;
  const mainImage = item.main_image?.image_url ?? item.mainImage ?? null;
  return {
    id,
    postmarkKey: item.postmark_key ?? item.postmarkKey ?? "",
    facilityName: item.facility_name ?? item.facilityName ?? "",
    shapeName: item.shape_name ?? item.shapeName ?? "",
    rateLocation: item.rate_location ?? item.rateLocation ?? "",
    rateValue: item.rate_value ?? item.rateValue ?? "",
    isManuscript: item.is_manuscript ?? item.isManuscript ?? false,
    mainImage: mainImage ?? null,
    responsibleGroups: item.responsible_groups ?? item.responsibleGroups ?? [],
  };
}

/**
 * Fetches postmarks from Django GET /api/postmarks/ (all pages).
 */
export async function getPostmarks(): Promise<PostmarkRecord[]> {
  const results = await fetchAllPages<PostmarkApiResultItem>("postmarks");
  return results.map(mapApiResultToRecord);
}
