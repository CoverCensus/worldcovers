/**
 * Framing styles: from GET /api/framing-styles/ when VITE_FRAMING_STYLES_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** One item from GET /api/framing-styles/ */
export interface FramingStyleApiResultItem {
  framingStyleId: number;
  createdDate: string;
  modifiedDate: string;
  framingStyleName: string;
  framingDescription: string;
  createdBy: number;
  modifiedBy: number;
}

/** Paginated response from GET /api/framing-styles/ */
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
    id: item.framingStyleId,
    name: item.framingStyleName,
    description: item.framingDescription,
  };
}

function getFramingStylesApiUrl(): string | null {
  const env = import.meta.env.VITE_FRAMING_STYLES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/framing-styles")) return base;
  return `${base}/api/framing-styles`;
}

/**
 * Fetches framing styles from GET /api/framing-styles/.
 * When VITE_FRAMING_STYLES_API_URL is not set, returns [].
 */
export async function getFramingStyles(): Promise<FramingStyleOption[]> {
  const apiUrl = getFramingStylesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Framing styles API error: ${res.status} ${res.statusText}`);
  }

  const data: FramingStyleApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error("Framing styles API: invalid response (missing results array)");
  }

  return data.results.map(mapApiResultToOption);
}
