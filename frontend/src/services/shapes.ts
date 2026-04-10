/**
 * V2 common shapes service from GET /shapes/.
 */
export interface ShapeApiResultItem {
  id: number;
  name: string;
  code?: string | null;
  notes?: string | null;
}

export interface ShapeApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ShapeApiResultItem[];
}

export interface ShapeOption {
  id: number;
  name: string;
  description: string;
}

function getShapesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/shapes")) return base;
  return `${base}/shapes`;
}

function mapApiResultToOption(item: ShapeApiResultItem): ShapeOption {
  return {
    id: item.id,
    name: item.name,
    description: (item.notes ?? "").trim(),
  };
}

export async function getShapes(): Promise<ShapeOption[]> {
  const apiUrl = getShapesApiUrl();
  if (!apiUrl) return [];

  const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  let nextUrl: string | null = firstUrl;
  const allResults: ShapeOption[] = [];
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Shapes API error: ${res.status} ${res.statusText}`);
    }
    const data: ShapeApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Shapes API: invalid response (missing results array)");
    }

    allResults.push(...data.results.map(mapApiResultToOption));
    nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults;
}
