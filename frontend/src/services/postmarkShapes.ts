/**
 * Postmark shapes: from GET /postmark-shapes/ (future) or Supabase (now).
 * - When VITE_POSTMARK_SHAPES_API_URL is set → fetch from API.
 * - When not set → derive distinct type from Supabase catalog_records and submissions.
 */

import { supabase } from "@/integrations/supabase/client";

/** One item from GET /postmark-shapes/ (DRF returns snake_case) */
export interface PostmarkShapeApiResultItem {
  postmark_shape_id?: number;
  shape_name?: string;
  shape_description?: string;
  id?: number;
  name?: string;
  notes?: string | null;
}

/** Paginated response from GET /postmark-shapes/ */
export interface PostmarkShapeApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostmarkShapeApiResultItem[];
}

/** Normalized option for dropdowns / filters */
export interface PostmarkShapeOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: PostmarkShapeApiResultItem): PostmarkShapeOption {
  return {
    id: item.postmark_shape_id ?? item.id ?? 0,
    name: item.shape_name ?? item.name ?? "",
    description: item.shape_description ?? (item.notes ?? ""),
  };
}

async function readJsonOrThrow(res: Response, endpoint: string): Promise<any> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Postmark shapes API returned non-JSON at ${endpoint} (${res.status}). Response starts with: ${snippet || "<empty>"}`
    );
  }
  return res.json();
}

function getPostmarkShapesApiUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (env && typeof env === "string" && env.trim() !== "") {
    const base = env.trim().replace(/\/+$/, "");
    if (base.endsWith("/postmark-shapes")) return base;
    return `${base}/postmark-shapes`;
  }
  // Fallback: use postmarks API base (e.g. .../api/postmarks → .../api/postmark-shapes)
  const postmarksBase = import.meta.env.VITE_POSTMARKS_API_URL;
  if (postmarksBase && typeof postmarksBase === "string" && postmarksBase.trim() !== "") {
    const base = postmarksBase.trim().replace(/\/+$/, "");
    return base.replace(/postmarks\/?$/, "postmark-shapes");
  }
  return null;
}

function getPostmarkShapesApiCandidates(): string[] {
  const candidates: string[] = [];
  // Prefer v2 commons shape taxonomy first.
  candidates.push("/api/v2/shapes");
  // Keep current/legacy routes as fallback.
  candidates.push("/api/v2/postmark-shapes");
  candidates.push("/api/v1/postmark-shapes");
  const pushCandidate = (raw: unknown) => {
    if (!raw || typeof raw !== "string") return;
    const base = raw.trim().replace(/\/+$/, "");
    if (!base) return;
    if (base.endsWith("/shapes") || base.endsWith("/postmark-shapes")) {
      candidates.push(base);
      return;
    }
    candidates.push(`${base}/shapes`);
    candidates.push(`${base}/postmark-shapes`);
  };
  pushCandidate(import.meta.env.VITE_API_URL);
  pushCandidate(import.meta.env.VITE_API_BASE_URL);
  return candidates.filter((url, idx) => candidates.indexOf(url) === idx);
}

/**
 * Fetch all pages from the paginated /api/postmark-shapes/ endpoint so we
 * can show every postmark type in dropdowns, not just the first page.
 */
async function getAllPostmarkShapesFromApi(apiUrl: string): Promise<PostmarkShapeOption[]> {
  const firstUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  let nextUrl: string | null = firstUrl;
  const allResults: PostmarkShapeOption[] = [];
  let safetyCounter = 0;

  while (nextUrl && safetyCounter < 50) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Postmark shapes API error: ${res.status} ${res.statusText}`);
    }
    const data: PostmarkShapeApiResponse = await readJsonOrThrow(res, nextUrl);
    if (!Array.isArray(data.results)) {
      throw new Error("Postmark shapes API: invalid response (missing results array)");
    }

    allResults.push(
      ...data.results
        .map(mapApiResultToOption)
        .filter((x) => x.id > 0 && x.name.trim() !== "")
    );

    nextUrl =
      typeof data.next === "string" && data.next.trim() !== "" ? data.next : null;
    safetyCounter += 1;
  }

  return allResults;
}

/**
 * Fetches distinct type from Supabase catalog_records and submissions.
 * Mapped to PostmarkShapeOption (id = index, name = type, description = "").
 */
async function getPostmarkShapesFromSupabase(): Promise<PostmarkShapeOption[]> {
  const types = new Set<string>();

  const { data: catalogData } = await supabase
    .from("catalog_records")
    .select("type");

  const { data: submissionData } = await supabase
    .from("submissions")
    .select("type");

  for (const row of catalogData ?? []) {
    if (row?.type && String(row.type).trim()) types.add(String(row.type).trim());
  }
  for (const row of submissionData ?? []) {
    if (row?.type && String(row.type).trim()) types.add(String(row.type).trim());
  }

  return Array.from(types)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name, index) => ({ id: index, name, description: "" }));
}

/**
 * Fetches postmark shapes. When VITE_POSTMARK_SHAPES_API_URL is set, uses GET /postmark-shapes/.
 * Otherwise uses Supabase (distinct type from catalog_records and submissions).
 */
export async function getPostmarkShapes(): Promise<PostmarkShapeOption[]> {
  const primary = getPostmarkShapesApiUrl();
  const candidates = primary ? [primary, ...getPostmarkShapesApiCandidates()] : getPostmarkShapesApiCandidates();
  for (const apiUrl of candidates) {
    try {
      const result = await getAllPostmarkShapesFromApi(apiUrl);
      if (result.length > 0) return result;
    } catch {
      // Try next candidate URL.
    }
  }

  return getPostmarkShapesFromSupabase();
}
