/**
 * Postmark valuations: from Django GET /api/postmark-valuations/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** User object in valuedBy */
export interface PostmarkValuationUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/** One item from /api/postmark-valuations/ */
export interface PostmarkValuationApiResultItem {
  postmarkValuationId?: number;
  postmark_valuation_id?: number;
  valuedBy?: PostmarkValuationUser;
  valued_by?: PostmarkValuationUser;
  estimatedValue?: string | number;
  estimated_value?: string | number;
  valuationDate?: string;
  valuation_date?: string;
  createdDate?: string;
  created_date?: string;
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
  const id = item.postmarkValuationId ?? item.postmark_valuation_id ?? 0;
  const valuedBy = item.valuedBy ?? item.valued_by ?? {
    id: 0,
    username: "",
    email: "",
  };
  const estimatedValue = String(
    item.estimatedValue ?? item.estimated_value ?? ""
  );
  return {
    id,
    valuedBy,
    estimatedValue,
    valuationDate: item.valuationDate ?? item.valuation_date ?? "",
    createdDate: item.createdDate ?? item.created_date ?? "",
  };
}

/**
 * Fetches postmark valuations from Django GET /api/postmark-valuations/.
 */
export async function getPostmarkValuations(): Promise<
  PostmarkValuationRecord[]
> {
  const results = await fetchAllPages<PostmarkValuationApiResultItem>(
    "postmark-valuations"
  );
  return results.map(mapApiResultToRecord);
}
