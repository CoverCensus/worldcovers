/**
 * Date formats: from GET /date-formats/ when VITE_DATE_FORMATS_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** One item from GET /date-formats/ */
export interface DateFormatApiResultItem {
  dateFormatId?: number;
  createdDate?: string;
  modifiedDate?: string;
  formatName?: string;
  formatDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
  id?: number;
  name?: string;
  notes?: string | null;
}

/** Paginated response from GET /date-formats/ */
export interface DateFormatApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: DateFormatApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface DateFormatOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: DateFormatApiResultItem): DateFormatOption {
  return {
    id: item.dateFormatId ?? item.id ?? 0,
    name: item.formatName ?? item.name ?? "",
    description: item.formatDescription ?? (item.notes ?? ""),
  };
}

function getDateFormatsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/date-formats")) return base;
  return `${base}/date-formats`;
}

function getDateFormatsApiCandidates(): string[] {
  const candidates: string[] = [];
  // Prefer v1 route for moderation-compatible IDs.
  candidates.push("/api/v1/date-formats");
  candidates.push("/api/v2/date-formats");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    candidates.push(base.endsWith("/date-formats") ? base : `${base}/date-formats`);
  };
  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

async function readJsonOrThrow(res: Response, endpoint: string): Promise<any> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Date formats API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

/**
 * Fetches date formats from GET /date-formats/.
 * When VITE_DATE_FORMATS_API_URL is not set, returns [].
 */
export async function getDateFormats(): Promise<DateFormatOption[]> {
  const candidates = getDateFormatsApiCandidates();
  if (candidates.length === 0) return [];

  let lastError: unknown = null;
  for (const apiUrl of candidates) {
    try {
      const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Date formats API error: ${res.status} ${res.statusText}`);
      }

      const data: DateFormatApiResponse = await readJsonOrThrow(res, url);
      if (!Array.isArray(data.results)) {
        throw new Error("Date formats API: invalid response (missing results array)");
      }

      return data.results.map(mapApiResultToOption).filter((x) => x.id > 0 && x.name.trim() !== "");
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Date formats API failed for all configured base URLs."));
}
