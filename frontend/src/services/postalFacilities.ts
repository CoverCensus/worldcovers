/**
 * Postal facilities: from Django GET /api/postal-facilities/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/postal-facilities/ */
export interface PostalFacilitiesApiResultItem {
  postalFacilityId: number;
  referenceCode: string;
  currentName: string | null;
  currentType: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Normalized option for dropdowns/filters */
export interface PostalFacilityOption {
  id: number;
  referenceCode: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
}

function mapApiResultToOption(item: PostalFacilitiesApiResultItem): PostalFacilityOption {
  return {
    id: item.postalFacilityId,
    referenceCode: item.referenceCode ?? "",
    name: item.currentName ?? "",
    type: item.currentType ?? "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
  };
}

/**
 * Fetches postal facilities from Django GET /api/postal-facilities/.
 */
export async function getPostalFacilities(): Promise<PostalFacilityOption[]> {
  const results = await fetchAllPages<PostalFacilitiesApiResultItem>("postal-facilities");
  return results.map(mapApiResultToOption);
}
