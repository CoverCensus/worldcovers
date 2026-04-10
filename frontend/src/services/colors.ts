/**
 * Colors service: fetch from API with v2-first candidates.
 */

/** One item from the external /api/colors/ response */
export interface ColorsApiResultItem {
  colorId?: number;
  createdDate?: string;
  modifiedDate?: string;
  colorName?: string;
  colorValue?: string;
  createdBy?: number;
  modifiedBy?: number;
  color_id?: number;
  color_name?: string;
  color_value?: string;
  id?: number;
  name?: string;
  value?: string | null;
}

/** Paginated response from GET /colors/ */
export interface ColorsApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ColorsApiResultItem[];
}

/** Normalized color used in the app (dropdowns, filters) */
export interface ColorOption {
  id: number;
  name: string;
  value: string; // hex from API, or "" when from Supabase
}

function mapApiResultToOption(item: ColorsApiResultItem): ColorOption {
  return {
    id: item.colorId ?? item.color_id ?? item.id ?? 0,
    name: item.colorName ?? item.color_name ?? item.name ?? "",
    value: item.colorValue ?? item.color_value ?? item.value ?? "",
  };
}

async function readJsonOrThrow(res: Response, endpoint: string): Promise<any> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Colors API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

/**
 * Base URL for the colors API.
 * VITE_COLORS_API_URL can be the full path (e.g. https://api.example.com/api/colors)
 * or just the origin (we append /api/colors).
 */
function getColorsApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/colors")) return base;
  return `${base}/colors`;
}

function getColorsApiCandidates(): string[] {
  const candidates: string[] = [];
  // Prefer v2 source first.
  candidates.push("/api/v2/colors");
  // Keep v1 compatibility as fallback only.
  candidates.push("/api/v1/colors");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    candidates.push(base.endsWith("/colors") ? base : `${base}/colors`);
  };
  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

/**
 * Fetch all pages from the paginated /api/colors/ endpoint so dropdowns get
 * the complete list of colors instead of just the first page.
 */
async function getAllColorsFromApi(apiUrl: string): Promise<ColorOption[]> {
  const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  let nextUrl: string | null = firstUrl;
  const allResults: ColorOption[] = [];
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Colors API error: ${res.status} ${res.statusText}`);
    }
    const data: ColorsApiResponse = await readJsonOrThrow(res, nextUrl);
    if (!Array.isArray(data.results)) {
      throw new Error("Colors API: invalid response (missing results array)");
    }

    allResults.push(...data.results.map(mapApiResultToOption));

    nextUrl =
      typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults;
}

/**
 * Fetches distinct colors from Supabase (catalog_records + submissions).
 * Returns ColorOption[] with id = index, name = color string, value = "".
 */
// async function getColorsFromSupabase(): Promise<ColorOption[]> {
//   const colors = new Set<string>();

//   const { data: catalogColors } = await supabase
//     .from("catalog_records")
//     .select("color");

//   const { data: submissionColors } = await supabase
//     .from("submissions")
//     .select("color");

//   for (const row of catalogColors ?? []) {
//     if (row?.color && String(row.color).trim()) colors.add(String(row.color).trim());
//   }
//   for (const row of submissionColors ?? []) {
//     if (row?.color && String(row.color).trim()) colors.add(String(row.color).trim());
//   }

//   return Array.from(colors)
//     .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
//     .map((name, index) => ({ id: index, name, value: "" }));
// }

/**
 * Fetches color options. When VITE_COLORS_API_URL is set, uses GET /colors/.
 * Otherwise uses Supabase (distinct colors from catalog_records and submissions).
 */
export async function getColors(): Promise<ColorOption[]> {
  const apiUrl = getColorsApiUrl();
  const candidates = apiUrl ? [apiUrl, ...getColorsApiCandidates()] : getColorsApiCandidates();
  for (const candidate of candidates) {
    try {
      const result = await getAllColorsFromApi(candidate);
      const normalized = result.filter((x) => x.id > 0 && x.name.trim() !== "");
      if (normalized.length > 0) return normalized;
    } catch {
      // Try next candidate URL.
    }
  }
  return [];
}
