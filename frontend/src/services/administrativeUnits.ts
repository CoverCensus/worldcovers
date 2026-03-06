/**
 * Administrative units (states/locations): from GET /api/administrative-units/
 * Used for state filter options in Search.
 */

/** One item from GET /api/administrative-units/ (camelCase from DRF) */
export interface AdministrativeUnitApiItem {
  administrativeUnitId: number;
  referenceCode: string;
  currentName: string | null;
  currentType: string | null;
}

/** Paginated response from GET /api/administrative-units/ */
export interface AdministrativeUnitsApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdministrativeUnitApiItem[];
}

/** Option for state filter dropdown */
export interface StateOption {
  value: string;
  label: string;
}

function getAdministrativeUnitsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/administrative-units")) return base;
  return `${base}/api/administrative-units`;
}

/**
 * Fetches all administrative units from GET /api/administrative-units/.
 * Follows pagination (next) so the filter dropdown gets every state in the catalog.
 * Returns state options (value = currentName, label = currentName).
 */
export async function getAdministrativeUnits(): Promise<StateOption[]> {
  const apiUrl = getAdministrativeUnitsApiUrl();
  if (!apiUrl) {
    return [];
  }

  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const allResults: AdministrativeUnitApiItem[] = [];
  let nextUrl: string | null = `${base}?page_size=500`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Administrative units API error: ${res.status} ${res.statusText}`);
    }
    const data: AdministrativeUnitsApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Administrative units API: invalid response (missing results array)");
    }
    allResults.push(...data.results);
    nextUrl = data.next;
  }

  const seen = new Set<string>();
  return allResults
    .filter((u) => {
      const name = u.currentName?.trim();
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((u) => ({
      value: u.currentName!.trim(),
      label: u.currentName!.trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function getAssignedAdministrativeUnitsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  return `${base}/api/assigned-states`;
}

/**
 * Fetches only the administrative units assigned to the current user.
 * Returns state options (value = name, label = name).
 */
export async function getAssignedAdministrativeUnits(): Promise<StateOption[]> {
  const apiUrl = getAssignedAdministrativeUnitsApiUrl();
  if (!apiUrl) return [];
  const res = await fetch(apiUrl);
  if (!res.ok) {
    throw new Error(`Assigned states API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Assigned states API: invalid response");
  }
  return data
    .filter((item) => item && typeof item.value === "string")
    .map((item) => ({
      value: item.value,
      label: item.label || item.value,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}
