/**
 * Lettering styles: from GET /letterings/ (v2 common_lettering).
 * No Supabase fallback (no matching table).
 */

/** One item from GET /letterings/ */
export interface LetteringStyleApiResultItem {
  id?: number;
  name?: string;
  notes?: string;
  code?: string;
  letteringStyleId?: number;
  letteringStyleName?: string;
  letteringDescription?: string;
}

/** Paginated response from GET /letterings/ */
export interface LetteringStyleApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LetteringStyleApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface LetteringStyleOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: LetteringStyleApiResultItem): LetteringStyleOption {
  return {
    id: item.id ?? item.letteringStyleId ?? 0,
    name: item.name ?? item.letteringStyleName ?? "",
    description: item.notes ?? item.letteringDescription ?? "",
  };
}

function getLetteringStylesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/letterings")) return base;
  return `${base}/letterings`;
}

function getLetteringStylesApiCandidates(): string[] {
  const candidates: string[] = [];
  // Always prefer v2 commons source for lettering taxonomy.
  candidates.push("/api/v2/letterings");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    candidates.push(base.endsWith("/letterings") ? base : `${base}/letterings`);
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
      `Lettering styles API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

/**
 * Fetches lettering styles from GET /letterings/ (common_lettering).
 * When VITE_LETTERING_STYLES_API_URL is not set, returns [].
 */
export async function getLetteringStyles(): Promise<LetteringStyleOption[]> {
  const primary = getLetteringStylesApiUrl();
  const candidates = getLetteringStylesApiCandidates();
  // Keep env-derived primary as an additional fallback (not first).
  if (primary && !candidates.includes(primary)) candidates.push(primary);
  if (candidates.length === 0) return [];

  let lastError: unknown = null;
  for (const apiUrl of candidates) {
    try {
      const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
      let nextUrl: string | null = firstUrl;
      const allResults: LetteringStyleOption[] = [];
      let safetyCounter = 0;

      while (nextUrl && safetyCounter < 50) {
        const res = await fetch(nextUrl);
        if (!res.ok) {
          throw new Error(`Lettering styles API error: ${res.status} ${res.statusText}`);
        }

        const data: LetteringStyleApiResponse = await readJsonOrThrow(res, nextUrl);
        if (!Array.isArray(data.results)) {
          throw new Error("Lettering styles API: invalid response (missing results array)");
        }

        allResults.push(...data.results.map(mapApiResultToOption));
        nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
        safetyCounter += 1;
      }

      return allResults.filter((x) => x.id > 0 && x.name.trim() !== "");
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Lettering styles API failed for all configured base URLs."));
}
