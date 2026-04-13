/**
 * Letterings (v2 Lettering entity): GET /letterings/.
 */
import apiClient from "@/lib/api";

/** One item from GET /letterings/ */
export interface LetteringApiResultItem {
  id?: number;
  lettering_id?: number;
  letteringId?: number;
  createdDate?: string;
  modifiedDate?: string;
  name?: string;
  code?: string | null;
  notes?: string | null;
  // Legacy (pre-v2) fields; kept as or-coalesce inputs until backend drops them.
  letteringStyleId?: number;
  letteringStyleName?: string;
  letteringDescription?: string;
}

/** Paginated response from GET /letterings/ */
export interface LetteringApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LetteringApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface LetteringOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: LetteringApiResultItem): LetteringOption {
  return {
    id: item.lettering_id ?? item.letteringId ?? item.id ?? item.letteringStyleId ?? 0,
    name: item.name ?? item.letteringStyleName ?? "",
    description: item.notes ?? item.letteringDescription ?? "",
  };
}

/**
 * Fetches letterings from GET /letterings/.
 */
export async function getLetterings(): Promise<LetteringOption[]> {
  const allResults: LetteringOption[] = [];
  let nextUrl: string | null = "/letterings/";
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await apiClient.get<LetteringApiResponse>(nextUrl);
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Letterings API: invalid response (missing results array)");
    }
    allResults.push(...data.results.map(mapApiResultToOption));
    nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults.filter((x) => x.id > 0 && x.name.trim() !== "");
}
