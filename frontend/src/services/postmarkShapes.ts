/**
 * Postmark shapes: from Django GET /api/postmark-shapes/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/postmark-shapes/ */
export interface PostmarkShapeApiResultItem {
  postmarkShapeId: number;
  createdDate?: string;
  modifiedDate?: string;
  shapeName: string;
  shapeDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
}

/** Normalized option for dropdowns / filters */
export interface PostmarkShapeOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: PostmarkShapeApiResultItem): PostmarkShapeOption {
  return {
    id: item.postmarkShapeId,
    name: item.shapeName,
    description: item.shapeDescription ?? "",
  };
}

/**
 * Fetches postmark shapes from Django GET /api/postmark-shapes/.
 */
export async function getPostmarkShapes(): Promise<PostmarkShapeOption[]> {
  const results = await fetchAllPages<PostmarkShapeApiResultItem>("postmark-shapes");
  return results.map(mapApiResultToOption);
}
