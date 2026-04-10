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

/**
 * Fetches lettering styles from GET /letterings/ (common_lettering).
 * When VITE_LETTERING_STYLES_API_URL is not set, returns [].
 */
export async function getLetteringStyles(): Promise<LetteringStyleOption[]> {
  const apiUrl = getLetteringStylesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  let nextUrl: string | null = firstUrl;
  const allResults: LetteringStyleOption[] = [];
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Lettering styles API error: ${res.status} ${res.statusText}`);
    }

    const data: LetteringStyleApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Lettering styles API: invalid response (missing results array)");
    }

    allResults.push(...data.results.map(mapApiResultToOption));
    nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults.filter((x) => x.id > 0 && x.name.trim() !== "");
}
