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
 * Fetches administrative units from GET /api/administrative-units/.
 * Follows pagination (next) so the filter dropdown gets every state in the catalog.
 * Returns state options (value = currentName, label = currentName).
 * @param assignedOnly - When true, only returns states assigned to the current user (Contribute, Dashboard). When false/undefined, returns all states (Search).
 */
export async function getAdministrativeUnits(assignedOnly?: boolean): Promise<StateOption[]> {
  const apiUrl = getAdministrativeUnitsApiUrl();
  if (!apiUrl) {
    return [];
  }

  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const params = new URLSearchParams({ page_size: "500" });
  if (assignedOnly) {
    params.set("assigned_only", "true");
  }
  const allResults: AdministrativeUnitApiItem[] = [];
  let nextUrl: string | null = `${base}?${params.toString()}`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { credentials: "include" });
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
