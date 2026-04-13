/**
 * Framings (v2 Framing entity): GET /framings/.
 */
import apiClient from "@/lib/api";

/** One item from GET /framings/ */
export interface FramingApiResultItem {
  id?: number;
  framing_id?: number;
  framingId?: number;
  createdDate?: string;
  modifiedDate?: string;
  name?: string;
  code?: string | null;
  notes?: string | null;
  // Legacy (pre-v2) fields; kept as or-coalesce inputs until backend drops them.
  framingStyleId?: number;
  framingStyleName?: string;
  framingDescription?: string;
}

/** Paginated response from GET /framings/ */
export interface FramingApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FramingApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface FramingOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: FramingApiResultItem): FramingOption {
  return {
    id: item.framing_id ?? item.framingId ?? item.id ?? item.framingStyleId ?? 0,
    name: item.name ?? item.framingStyleName ?? "",
    description: item.notes ?? item.framingDescription ?? "",
  };
}

/**
 * Fetches framings from GET /framings/.
 */
export async function getFramings(): Promise<FramingOption[]> {
  const allResults: FramingOption[] = [];
  let nextUrl: string | null = "/framings/";
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get<FramingApiResponse>(nextUrl);
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Framings API: invalid response (missing results array)");
    }
    allResults.push(...data.results.map(mapApiResultToOption));
    nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults.filter((x) => x.id > 0 && x.name.trim() !== "");
}
