/**
 * Framing styles: from GET /framing-styles/ when VITE_FRAMING_STYLES_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** One item from GET /framing-styles/ */
export interface FramingStyleApiResultItem {
  framingStyleId?: number;
  createdDate?: string;
  modifiedDate?: string;
  framingStyleName?: string;
  framingDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
  id?: number;
  name?: string;
  notes?: string | null;
}

/** Paginated response from GET /framing-styles/ */
export interface FramingStyleApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FramingStyleApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface FramingStyleOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: FramingStyleApiResultItem): FramingStyleOption {
  return {
    id: item.framingStyleId ?? item.id ?? 0,
    name: item.framingStyleName ?? item.name ?? "",
    description: item.framingDescription ?? (item.notes ?? ""),
  };
}

function getFramingStylesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/framing-styles")) return base;
  return `${base}/framing-styles`;
}

function getFramingStylesApiCandidates(): string[] {
  const candidates: string[] = [];
  // Prefer v2 commons dataset first.
  candidates.push("/api/v2/framings");
  // Explicit v1 compatibility route.
  candidates.push("/api/v1/framing-styles");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    if (base.endsWith("/framings") || base.endsWith("/framing-styles")) {
      candidates.push(base);
      return;
    }
    candidates.push(`${base}/framings`);
    candidates.push(`${base}/framing-styles`);
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
      `Framing styles API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

/**
 * Fetches framing styles from GET /framing-styles/.
 * When VITE_FRAMING_STYLES_API_URL is not set, returns [].
 */
export async function getFramingStyles(): Promise<FramingStyleOption[]> {
  const primary = getFramingStylesApiUrl();
  const candidates = getFramingStylesApiCandidates();
  if (primary && !candidates.includes(primary)) candidates.push(primary);
  if (candidates.length === 0) return [];

  let lastError: unknown = null;
  for (const apiUrl of candidates) {
    try {
      const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Framing styles API error: ${res.status} ${res.statusText}`);
      }

      const data: FramingStyleApiResponse = await readJsonOrThrow(res, url);
      if (!Array.isArray(data.results)) {
        throw new Error("Framing styles API: invalid response (missing results array)");
      }

      return data.results.map(mapApiResultToOption).filter((x) => x.id > 0 && x.name.trim() !== "");
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Framing styles API failed for all configured base URLs."));
}
