import { PostmarkApiResponse } from "./postmarks";

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

export async function getPostmarksDateRange(): Promise<PostmarkDateRange | null> {
  const apiUrl = getPostmarksRangeApiUrl();
  if (!apiUrl) {
    return null;
  }
  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  return {
    earliest_year:
      typeof data.earliest_year === "number" ? data.earliest_year : null,
    latest_year:
      typeof data.latest_year === "number" ? data.latest_year : null,
  };
}

