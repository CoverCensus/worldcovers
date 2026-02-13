/**
 * Postal facility identities: from Django GET /api/postal-facility-identities/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** User object in createdBy/modifiedBy */
export interface PostalFacilityIdentityUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/** One item from /api/postal-facility-identities/ */
export interface PostalFacilityIdentityApiResultItem {
  postalFacilityIdentityId: number;
  coordinates?: unknown;
  createdBy?: PostalFacilityIdentityUser;
  modifiedBy?: PostalFacilityIdentityUser;
  createdDate: string;
  modifiedDate: string;
  effectiveFromDate: string;
  effectiveToDate: string | null;
  facilityName: string;
  facilityType: string;
  isOperational: boolean;
  discontinuationReason: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  postalFacility: number;
}

/** Normalized option for dropdowns / display */
export interface PostalFacilityIdentityOption {
  id: number;
  facilityName: string;
  facilityType: string;
  effectiveFromDate: string;
  effectiveToDate: string | null;
  isOperational: boolean;
  discontinuationReason: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  postalFacility: number;
}

function mapApiResultToOption(
  item: PostalFacilityIdentityApiResultItem
): PostalFacilityIdentityOption {
  return {
    id: item.postalFacilityIdentityId,
    facilityName: item.facilityName ?? "",
    facilityType: item.facilityType ?? "",
    effectiveFromDate: item.effectiveFromDate ?? "",
    effectiveToDate: item.effectiveToDate ?? null,
    isOperational: item.isOperational ?? false,
    discontinuationReason: item.discontinuationReason ?? "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    notes: item.notes ?? "",
    postalFacility: item.postalFacility,
  };
}

/**
 * Fetches postal facility identities from Django GET /api/postal-facility-identities/.
 */
export async function getPostalFacilityIdentities(): Promise<
  PostalFacilityIdentityOption[]
> {
  const results = await fetchAllPages<PostalFacilityIdentityApiResultItem>(
    "postal-facility-identities"
  );
  return results.map(mapApiResultToOption);
}
