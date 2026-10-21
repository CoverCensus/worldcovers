/**
 * Similar existing Markings for the submission form (Trello T48).
 *
 * GET /markings/similar/ — read-only, advisory. The server answers an empty
 * 200 for an incomplete form, so callers never see a 4xx for "not enough
 * typed yet". Kept out of services/markings.ts on purpose: the form tests
 * spread `jest.requireActual("@/services/markings")`, and a new call there
 * would reach the network from every one of them.
 */
import apiClient from "@/lib/api";

export type SimilarTier = "match" | "related";

export interface SimilarMarking {
  id: number;
  tier: SimilarTier;
  town: string;
  stateAbbrev: string | null;
  type: string;
  inscription: string;
  isManuscript: boolean;
  shapeName: string | null;
  colorName: string | null;
  colorHex: string | null;
  width: string | null;
  height: string | null;
  earliestSeen: string | null;
  latestSeen: string | null;
  mainImageUrl: string | null;
}

export interface SimilarMarkingsResult {
  rows: SimilarMarking[];
  matchCount: number;
  relatedCount: number;
}

export interface SimilarMarkingsParams {
  state: string;
  town: string;
  type: string;
  inscription: string;
  shapeId?: number | null;
  color?: string | null;
  isManuscript?: boolean | null;
  widthMm?: string | null;
  heightMm?: string | null;
  excludeId?: number | null;
}

interface SimilarMarkingApiRow {
  id: number;
  tier: SimilarTier;
  town: string;
  state_abbrev: string | null;
  type: string;
  inscription: string;
  is_manuscript: boolean;
  shape_name: string | null;
  color_name: string | null;
  color_hex: string | null;
  width: string | null;
  height: string | null;
  earliest_seen: string | null;
  latest_seen: string | null;
  main_image_url: string | null;
}

interface SimilarMarkingsApiPayload {
  results: SimilarMarkingApiRow[];
  match_count: number;
  related_count: number;
}

function mapRow(row: SimilarMarkingApiRow): SimilarMarking {
  return {
    id: row.id,
    tier: row.tier,
    town: row.town ?? "",
    stateAbbrev: row.state_abbrev ?? null,
    type: row.type,
    inscription: row.inscription ?? "",
    isManuscript: Boolean(row.is_manuscript),
    shapeName: row.shape_name ?? null,
    colorName: row.color_name ?? null,
    colorHex: row.color_hex ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    earliestSeen: row.earliest_seen ?? null,
    latestSeen: row.latest_seen ?? null,
    mainImageUrl: row.main_image_url ?? null,
  };
}

export async function getSimilarMarkings(
  params: SimilarMarkingsParams,
): Promise<SimilarMarkingsResult> {
  const query: Record<string, string> = {
    state: params.state,
    town: params.town,
    type: params.type,
    inscription: params.inscription,
  };
  if (params.shapeId != null) query.shape = String(params.shapeId);
  if (params.color) query.color = params.color;
  if (params.isManuscript != null) query.is_manuscript = params.isManuscript ? "true" : "false";
  if (params.widthMm) query.width = params.widthMm;
  if (params.heightMm) query.height = params.heightMm;
  if (params.excludeId != null) query.exclude = String(params.excludeId);

  const { data } = await apiClient.get<SimilarMarkingsApiPayload>("/markings/similar/", {
    params: query,
  });
  return {
    rows: Array.isArray(data?.results) ? data.results.map(mapRow) : [],
    matchCount: Number(data?.match_count ?? 0),
    relatedCount: Number(data?.related_count ?? 0),
  };
}
