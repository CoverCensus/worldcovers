/**
 * Lettering styles: from GET /lettering-styles/ when VITE_LETTERING_STYLES_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** One item from GET /lettering-styles/ */
export interface LetteringStyleApiResultItem {
  letteringStyleId: number;
  createdDate: string;
  modifiedDate: string;
  letteringStyleName: string;
  letteringDescription: string;
  createdBy: number;
  modifiedBy: number;
}

/** Paginated response from GET /lettering-styles/ */
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
    id: item.letteringStyleId,
    name: item.letteringStyleName,
    description: item.letteringDescription,
  };
}

function getLetteringStylesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/lettering-styles")) return base;
  return `${base}/lettering-styles`;
}

/**
 * Fetches lettering styles from GET /lettering-styles/.
 * When VITE_LETTERING_STYLES_API_URL is not set, returns [].
 */
export async function getLetteringStyles(): Promise<LetteringStyleOption[]> {
  const apiUrl = getLetteringStylesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Lettering styles API error: ${res.status} ${res.statusText}`);
  }

  const data: LetteringStyleApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error("Lettering styles API: invalid response (missing results array)");
  }

  return data.results.map(mapApiResultToOption);
}
