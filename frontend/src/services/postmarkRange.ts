export interface PostmarkDateRange {
  earliest_year: number | null;
  latest_year: number | null;
}

function getPostmarksRangeApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  return `${base}/postmarks-range`;
}

function getPostmarksRangeApiCandidates(): string[] {
  const candidates: string[] = [];
  // Prefer v2 endpoint first.
  candidates.push("/api/v2/postmarks-range");
  // Keep v1 as fallback only.
  candidates.push("/api/v1/postmarks-range");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    candidates.push(base.endsWith("/postmarks-range") ? base : `${base}/postmarks-range`);
  };
  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

export async function getPostmarksDateRange(): Promise<PostmarkDateRange | null> {
  const apiUrl = getPostmarksRangeApiUrl();
  const candidates = apiUrl ? [apiUrl, ...getPostmarksRangeApiCandidates()] : getPostmarksRangeApiCandidates();
  for (const candidate of candidates) {
    try {
      const url = candidate.endsWith("/") ? candidate : `${candidate}/`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        earliest_year:
          typeof data.earliest_year === "number"
            ? data.earliest_year
            : (typeof data.earliestYear === "number" ? data.earliestYear : null),
        latest_year:
          typeof data.latest_year === "number"
            ? data.latest_year
            : (typeof data.latestYear === "number" ? data.latestYear : null),
      };
    } catch {
      // Try next candidate URL.
    }
  }
  return null;
}

