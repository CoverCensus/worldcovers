/**
 * Postmark valuations (v2 PostmarkValuation entity): GET /postmark-valuations/.
 */
import apiClient from "@/lib/api";

/** User object in valuedBy */
export interface PostmarkValuationUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** One item from GET /postmark-valuations/ */
export interface PostmarkValuationApiResultItem {
  postmarkValuationId: number;
  valuedBy: PostmarkValuationUser;
  estimatedValue: string;
  valuationDate: string;
  createdDate: string;
}

/** Paginated response from GET /postmark-valuations/ */
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

/**
 * Fetches postmark valuations from GET /postmark-valuations/.
 */
export async function getPostmarkValuations(): Promise<PostmarkValuationRecord[]> {
  const res = await apiClient.get<PostmarkValuationApiResponse>("/postmark-valuations/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Postmark valuations API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
