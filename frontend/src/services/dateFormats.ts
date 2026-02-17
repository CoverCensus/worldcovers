/**
 * Date formats: from GET /api/date-formats/ when VITE_DATE_FORMATS_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** One item from GET /api/date-formats/ */
export interface DateFormatApiResultItem {
  dateFormatId: number;
  createdDate: string;
  modifiedDate: string;
  formatName: string;
  formatDescription: string;
  createdBy: number;
  modifiedBy: number;
}

/** Paginated response from GET /api/date-formats/ */
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
    id: item.dateFormatId,
    name: item.formatName,
    description: item.formatDescription,
  };
}

function getDateFormatsApiUrl(): string | null {
  const env = import.meta.env.VITE_DATE_FORMATS_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/date-formats")) return base;
  return `${base}/api/date-formats`;
}

/**
 * Fetches date formats from GET /api/date-formats/.
 * When VITE_DATE_FORMATS_API_URL is not set, returns [].
 */
export async function getDateFormats(): Promise<DateFormatOption[]> {
  const apiUrl = getDateFormatsApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Date formats API error: ${res.status} ${res.statusText}`);
  }

  const data: DateFormatApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error("Date formats API: invalid response (missing results array)");
  }

  return data.results.map(mapApiResultToOption);
}
