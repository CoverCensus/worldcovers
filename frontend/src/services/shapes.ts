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
  let base = env.trim().replace(/\/+$/, "");
  // Prevent mixed-content calls when site is served over HTTPS.
  if (typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(base)) {
    try {
      const parsed = new URL(base);
      if (parsed.host === window.location.host) {
        base = parsed.pathname.replace(/\/+$/, "") || "/api/v2";
      } else {
        parsed.protocol = "https:";
        base = parsed.toString().replace(/\/+$/, "");
      }
    } catch {
      // keep original base; candidate fallback will still try safe defaults
    }
  }
  if (base.endsWith("/shapes")) return base;
  return `${base}/shapes`;
}

function getShapesApiCandidates(): string[] {
  const candidates: string[] = [];
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    let base = raw.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(base)) {
      try {
        const parsed = new URL(base);
        if (parsed.host === window.location.host) {
          base = parsed.pathname.replace(/\/+$/, "") || "/api/v2";
        } else {
          parsed.protocol = "https:";
          base = parsed.toString().replace(/\/+$/, "");
        }
      } catch {
        return;
      }
    }
    if (!base) return;
    candidates.push(base.endsWith("/shapes") ? base : `${base}/shapes`);
  };

  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  // Runtime-safe fallback for production where envs may still point at /api/v1.
  candidates.push("/api/v2/shapes");

  // Unique preserving order
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

function mapApiResultToOption(item: ShapeApiResultItem): ShapeOption {
  return {
    id: item.id,
    name: item.name,
    description: (item.notes ?? "").trim(),
  };
}

async function readJsonOrThrow(res: Response, endpoint: string): Promise<any> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Shapes API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

export async function getShapes(): Promise<ShapeOption[]> {
  const primary = getShapesApiUrl();
  const candidates = primary ? [primary, ...getShapesApiCandidates()] : getShapesApiCandidates();
  if (candidates.length === 0) return [];

  let lastError: unknown = null;
  for (const apiUrl of candidates) {
    try {
      const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
      let nextUrl: string | null = firstUrl;
      const allResults: ShapeOption[] = [];
      let safetyCounter = 0;

      while (nextUrl && safetyCounter < 50) {
        const res = await fetch(nextUrl);
        if (!res.ok) {
          throw new Error(`Shapes API error: ${res.status} ${res.statusText}`);
        }
        const data: ShapeApiResponse = await readJsonOrThrow(res, nextUrl);
        if (!Array.isArray(data.results)) {
          throw new Error("Shapes API: invalid response (missing results array)");
        }

        allResults.push(...data.results.map(mapApiResultToOption));
        nextUrl = typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
        safetyCounter += 1;
      }

      return allResults;
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Shapes API failed for all configured base URLs."));
}
