/**
 * Postal facility identities: from GET /api/postal-facility-identities/ when
 * VITE_POSTAL_FACILITY_IDENTITIES_API_URL is set. No Supabase fallback (no matching table).
 */

/** User object in createdBy/modifiedBy */
export interface PostalFacilityIdentityUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** One item from GET /api/postal-facility-identities/ */
export interface PostalFacilityIdentityApiResultItem {
  postalFacilityIdentityId: number;
  coordinates: unknown;
  createdBy: PostalFacilityIdentityUser;
  modifiedBy: PostalFacilityIdentityUser;
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

/** Paginated response from GET /api/postal-facility-identities/ */
export interface PostalFacilityIdentityApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostalFacilityIdentityApiResultItem[];
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
    facilityName: item.facilityName,
    facilityType: item.facilityType,
    effectiveFromDate: item.effectiveFromDate,
    effectiveToDate: item.effectiveToDate,
    isOperational: item.isOperational,
    discontinuationReason: item.discontinuationReason,
    latitude: item.latitude,
    longitude: item.longitude,
    notes: item.notes,
    postalFacility: item.postalFacility,
  };
}

function getPostalFacilityIdentitiesApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTAL_FACILITY_IDENTITIES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postal-facility-identities")) return base;
  return `${base}/api/postal-facility-identities`;
}

/**
 * Fetches postal facility identities from GET /api/postal-facility-identities/.
 * When VITE_POSTAL_FACILITY_IDENTITIES_API_URL is not set, returns [].
 */
export async function getPostalFacilityIdentities(): Promise<
  PostalFacilityIdentityOption[]
> {
  const apiUrl = getPostalFacilityIdentitiesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Postal facility identities API error: ${res.status} ${res.statusText}`
    );
  }

  const data: PostalFacilityIdentityApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Postal facility identities API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToOption);
}
