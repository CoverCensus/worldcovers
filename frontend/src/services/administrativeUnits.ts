/**
 * Administrative units (states/locations): from GET /administrative-units/
 * Used for state filter options in Search.
 */

/** One item from GET /administrative-units/ (DRF returns snake_case) */
export interface AdministrativeUnitApiItem {
  administrative_unit_id?: number;
  reference_code?: string;
  current_name?: string | null;
  current_type?: string | null;
  currentName?: string | null;
  unit_name?: string | null;
  unitName?: string | null;
  name?: string | null;
}

/** Paginated response from GET /administrative-units/ */
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

async function readJsonOrThrow(res: Response, endpoint: string): Promise<any> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Administrative units API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

function getAdministrativeUnitsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/administrative-units")) return base;
  return `${base}/administrative-units`;
}

function getAdministrativeUnitsApiCandidates(): string[] {
  const candidates: string[] = ["/api/v2/administrative-units", "/api/v1/administrative-units"];
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    candidates.push(base.endsWith("/administrative-units") ? base : `${base}/administrative-units`);
  };
  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

/**
 * Fetches administrative units from GET /administrative-units/.
 * Follows pagination (next) so the filter dropdown gets every state in the catalog.
 * Returns state options (value = currentName, label = currentName).
 * @param assignedOnly - When true, only returns states assigned to the current user (Contribute, Dashboard). When false/undefined, returns all states (Search).
 */
export async function getAdministrativeUnits(assignedOnly?: boolean): Promise<StateOption[]> {
  const primary = getAdministrativeUnitsApiUrl();
  const candidates = getAdministrativeUnitsApiCandidates();
  if (primary && !candidates.includes(primary)) candidates.push(primary);
  if (candidates.length === 0) return [];

  let lastError: unknown = null;
  for (const apiUrl of candidates) {
    try {
      const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
      const params = new URLSearchParams({ page_size: "500" });
      if (assignedOnly) {
        params.set("assigned_only", "true");
      }
      const allResults: AdministrativeUnitApiItem[] = [];
      let nextUrl: string | null = `${base}?${params.toString()}`;

      while (nextUrl) {
        const res = await fetch(nextUrl, { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Administrative units API error: ${res.status} ${res.statusText}`);
        }
        const data: AdministrativeUnitsApiResponse = await readJsonOrThrow(res, nextUrl);
        if (!Array.isArray(data.results)) {
          throw new Error("Administrative units API: invalid response (missing results array)");
        }
        allResults.push(...data.results);
        nextUrl = data.next;
      }

      const seen = new Set<string>();
      const normalized = allResults
        .map((u) =>
          String(
            u.current_name ??
            u.currentName ??
            u.unit_name ??
            u.unitName ??
            u.name ??
            ""
          ).trim()
        )
        .filter((name) => {
          if (!name || seen.has(name)) return false;
          seen.add(name);
          return true;
        })
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

      if (normalized.length > 0 || assignedOnly) return normalized;
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Administrative units API failed for all configured base URLs."));
}

function getAssignedAdministrativeUnitsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  return `${base}/assigned-states`;
}

/**
 * Fetches only the administrative units assigned to the current user.
 * Returns state options (value = name, label = name).
 */
export async function getAssignedAdministrativeUnits(): Promise<StateOption[]> {
  const apiUrl = getAssignedAdministrativeUnitsApiUrl();
  if (!apiUrl) return [];
  const res = await fetch(apiUrl, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Assigned states API error: ${res.status} ${res.statusText}`);
  }
  const data = await readJsonOrThrow(res, apiUrl);
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
