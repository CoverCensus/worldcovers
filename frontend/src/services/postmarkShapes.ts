/**
 * Postmark shapes: from GET /api/postmark-shapes/ (future) or Supabase (now).
 * - When VITE_POSTMARK_SHAPES_API_URL is set → fetch from API.
 * - When not set → derive distinct type from Supabase catalog_records and submissions.
 */

import { supabase } from "@/integrations/supabase/client";

/** One item from GET /api/postmark-shapes/ */
export interface PostmarkShapeApiResultItem {
  postmarkShapeId: number;
  createdDate: string;
  modifiedDate: string;
  shapeName: string;
  shapeDescription: string;
  createdBy: number;
  modifiedBy: number;
}

/** Paginated response from GET /api/postmark-shapes/ */
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
    id: item.postmarkShapeId,
    name: item.shapeName,
    description: item.shapeDescription,
  };
}

function getPostmarkShapesApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTMARK_SHAPES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postmark-shapes")) return base;
  return `${base}/api/postmark-shapes`;
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
 * Fetches postmark shapes. When VITE_POSTMARK_SHAPES_API_URL is set, uses GET /api/postmark-shapes/.
 * Otherwise uses Supabase (distinct type from catalog_records and submissions).
 */
export async function getPostmarkShapes(): Promise<PostmarkShapeOption[]> {
  const apiUrl = getPostmarkShapesApiUrl();
  if (apiUrl) {
    const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postmark shapes API error: ${res.status} ${res.statusText}`);
    }
    const data: PostmarkShapeApiResponse = await res.json();
    if (!Array.isArray(data.results)) {
      throw new Error("Postmark shapes API: invalid response (missing results array)");
    }
    return data.results.map(mapApiResultToOption);
  }

  return getPostmarkShapesFromSupabase();
}
