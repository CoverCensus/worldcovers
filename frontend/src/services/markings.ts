import apiClient from "@/lib/api";

/**
 * Unified Marking service. Replaces the legacy postmarks/ratemarks/auxmarks
 * facade that lived in services/postmarks.ts. The v2 API now returns one
 * row per marking (TOWNMARK | RATEMARK | AUXMARK), so the frontend no
 * longer fans out per-row to ratemark/auxmark side endpoints.
 *
 * Endpoints (under /api/v2):
 *   GET    /markings/                       list, paginated
 *   GET    /markings/{id}/                  detail
 *   GET    /markings/{id}/changelog/        version history
 *   POST   /markings/{id}/restore-version/  restore prior version
 *   DELETE /markings/{id}/delete-mine/      contributor self-delete
 *   GET    /markings/my-assigned/           editor's assigned-region rows
 *   GET    /markings-range/                 catalog earliest/latest year
 *   GET    /images/?subject_type=MARKING&subject_id=<id>  marking images
 */

export interface MarkingApiResponse {
  count: number | null;
  next: string | null;
  previous: string | null;
  results: unknown[];
  count_capped?: boolean;
}

export interface MarkingIdNameRef {
  id: number;
  name: string;
}

export type MarkingTypeValue = "TOWNMARK" | "RATEMARK" | "AUXMARK";

/** Image attached to a Marking or Cover via (subject_type, subject_id). */
export interface MarkingImage {
  imageId: number;
  subjectType: "COVER" | "MARKING";
  subjectId: number;
  imageUrl: string | null;
  imageView: string;
  originalFilename: string;
  storageFilename: string;
  imageDescription: string;
  displayOrder: number;
}

/** Canonical UI shape for a marking row (list or detail). */
export interface MarkingRecord {
  id: number;
  code: string;
  type: MarkingTypeValue;
  catalogTxt: string;
  inscriptionTxt: string;
  desc: string;
  isManuscript: boolean;
  isIrreg: boolean | null;
  width: string | null;
  height: string | null;
  sizeDisplay: string | null;
  dateFmt: string;
  impression: string;
  rateVal: string | null;
  postOfficeId: number | null;
  shapeId: number | null;
  letteringId: number | null;
  colorId: number | null;
  state: string;
  stateAbbrev: string;
  town: string;
  shapeName: string;
  letteringName: string;
  colorName: string;
  postOfficeName: string;
  regionName: string;
  earliestSeen: string | null;
  latestSeen: string | null;
  mainImage: MarkingImage | null;
  secondImage: MarkingImage | null;
  images: MarkingImage[];
}

export interface MarkingChangelogEvent {
  event_id: number;
  transaction_uuid: string;
  timestamp: string;
  action: string;
  action_label: string;
  actor: string | null;
  /**
   * Email address of the user who performed the event. Surfaced separately
   * from `actor` so the Record History panel can guarantee an email-based
   * audit trail even when the username happens to differ.
   */
  actor_email: string | null;
  source: string;
  contribution_id: number | null;
  version_no: number | null;
  summary: string;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
}

export interface MarkingVersionRow {
  version_no: number;
  created_at: string;
  created_by: string | null;
  transaction_id: number | null;
  action?: string | null;
  action_label?: string | null;
  snapshot?: {
    catalog_txt?: string;
    code?: string;
    town?: string;
    state?: string;
    type?: string;
    inscription_txt?: string;
    desc?: string;
    is_manuscript?: boolean;
    impression?: string;
    is_irreg?: boolean | null;
    shape_id?: number | null;
    lettering_id?: number | null;
    color_id?: number | null;
    date_fmt?: string;
    rate_val?: number | string | null;
    width?: number | string | null;
    height?: number | string | null;
  };
}

export interface MarkingChangelogResponse {
  id: number;
  events: MarkingChangelogEvent[];
  versions: MarkingVersionRow[];
  approved_versions?: MarkingVersionRow[];
}

export interface MarkingYearRange {
  earliestYear: number | null;
  latestYear: number | null;
}

export interface GetMarkingsPageResult {
  results: MarkingRecord[];
  count: number | null;
  next: string | null;
  previous: string | null;
  count_capped?: boolean;
}

/** Normalize image URL to absolute using the API origin when needed. */
export function normalizeImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiClient.defaults.baseURL;
  if (!base || !/^https?:\/\//i.test(base)) return path;
  try {
    const url = new URL(base);
    const relative = path.startsWith("/") ? path : `/${path}`;
    return `${url.origin}${relative}`;
  } catch {
    return path;
  }
}

/** Pull a usable URL out of an API image payload (or string). */
export function getMarkingListImageUrl(
  img: MarkingImage | string | null | undefined
): string | null {
  if (img == null) return null;
  if (typeof img === "string") return img || null;
  return img.imageUrl ?? null;
}

function toStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toIdOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return toIdOrNull(o.id);
  }
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function decimalToString(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function mapImage(raw: unknown): MarkingImage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const subjectType = toStr(o.subject_type) || "MARKING";
  const subjectId = toIdOrNull(o.subject_id) ?? 0;
  const imageId = toIdOrNull(o.image_id) ?? 0;
  return {
    imageId,
    subjectType: (subjectType === "COVER" ? "COVER" : "MARKING") as "COVER" | "MARKING",
    subjectId,
    imageUrl: typeof o.image_url === "string" ? o.image_url : null,
    imageView: toStr(o.image_view),
    originalFilename: toStr(o.original_filename),
    storageFilename: toStr(o.storage_filename),
    imageDescription: toStr(o.image_description),
    displayOrder: toNumOrNull(o.display_order) ?? 0,
  };
}

function mapImageList(raw: unknown): MarkingImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapImage).filter((x): x is MarkingImage => x !== null);
}

/**
 * Convert a /markings/ list or detail payload into MarkingRecord.
 * Single-pass mapper: snake_case in, camelCase out, no fallbacks. The API
 * is now the canonical shape; if a field is missing, the empty default is
 * what the UI renders.
 */
export function mapApiMarkingToRecord(raw: unknown): MarkingRecord {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const idVal = toIdOrNull(o.id) ?? 0;
  const images = mapImageList(o.images);
  const mainImage = mapImage(o.main_image) ?? images[0] ?? null;
  const secondImage = mapImage(o.second_image) ?? images[1] ?? null;
  const typeRaw = toStr(o.type).toUpperCase();
  const type: MarkingTypeValue =
    typeRaw === "RATEMARK" ? "RATEMARK" : typeRaw === "AUXMARK" ? "AUXMARK" : "TOWNMARK";
  return {
    id: idVal,
    code: toStr(o.code),
    type,
    catalogTxt: toStr(o.catalog_txt),
    inscriptionTxt: toStr(o.inscription_txt),
    desc: toStr(o.desc),
    isManuscript: Boolean(o.is_manuscript),
    isIrreg: o.is_irreg == null ? null : Boolean(o.is_irreg),
    width: decimalToString(o.width),
    height: decimalToString(o.height),
    sizeDisplay: typeof o.size_display === "string" ? o.size_display : null,
    dateFmt: toStr(o.date_fmt),
    impression: toStr(o.impression),
    rateVal: decimalToString(o.rate_val),
    postOfficeId: toIdOrNull(o.post_office),
    shapeId: toIdOrNull(o.shape),
    letteringId: toIdOrNull(o.lettering),
    colorId: toIdOrNull(o.color),
    state: toStr(o.state),
    stateAbbrev: toStr(o.state_abbrev),
    town: toStr(o.town),
    shapeName: toStr(o.shape_name),
    letteringName: toStr(o.lettering_name),
    colorName: toStr(o.color_name),
    postOfficeName: toStr(o.post_office_name),
    regionName: toStr(o.region_name),
    earliestSeen: typeof o.earliest_seen === "string" && o.earliest_seen ? o.earliest_seen : null,
    latestSeen: typeof o.latest_seen === "string" && o.latest_seen ? o.latest_seen : null,
    mainImage,
    secondImage,
    images,
  };
}

/** GET /markings/ paginated list with the standard catalog filters. */
export async function getMarkingsPage(
  page: number = 1,
  pageSize: number = 10,
  options?: {
    search?: string;
    shapeId?: string | number;
    type?: MarkingTypeValue | "all";
    manuscripts?: "both" | "only" | "none";
    color?: string;
    state?: string;
    town?: string;
    beginYear?: string;
    endYear?: string;
    hasImages?: boolean;
    deferCount?: boolean;
    ordering?: string;
  }
): Promise<GetMarkingsPageResult> {
  const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
  const opt = options ?? {};
  if (opt.search?.trim()) params.search = opt.search.trim();
  if (opt.shapeId != null && opt.shapeId !== "" && String(opt.shapeId) !== "all") {
    params.shape = String(opt.shapeId);
  }
  if (opt.type && opt.type !== "all") params.type = opt.type;
  if (opt.manuscripts === "only") params.is_manuscript = "true";
  else if (opt.manuscripts === "none") params.is_manuscript = "false";
  if (opt.color != null && opt.color !== "" && opt.color !== "all") params.color = opt.color;
  if (opt.state != null && opt.state !== "" && opt.state !== "all") params.state = opt.state.trim();
  if (opt.town?.trim()) params.town = opt.town.trim();
  if (opt.beginYear?.trim()) params.earliest_use_year_min = opt.beginYear.trim();
  if (opt.endYear?.trim()) params.latest_use_year_max = opt.endYear.trim();
  if (opt.hasImages === true) params.has_images = "true";
  if (opt.deferCount === true) params.include_count = "false";
  if (opt.ordering?.trim()) params.ordering = opt.ordering.trim();

  const res = await apiClient.get<MarkingApiResponse>("/markings/", { params });
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Markings API: invalid response (missing results array)");
  }
  return {
    results: data.results.map(mapApiMarkingToRecord),
    count: data.count,
    next: data.next,
    previous: data.previous,
    count_capped: data.count_capped,
  };
}

/** GET /markings/my-assigned/ for state editors (auth required). */
export async function getAssignedCatalogPage(
  page: number = 1,
  pageSize: number = 10,
  options?: {
    filters?: { state?: string; town?: string; shape?: string; color?: string; search?: string };
  }
): Promise<GetMarkingsPageResult> {
  const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
  const f = options?.filters;
  if (f?.state && f.state !== "all") params.state = f.state;
  if (f?.town?.trim()) params.town = f.town.trim();
  if (f?.shape && f.shape !== "all") params.shape = f.shape;
  if (f?.color && f.color !== "all") params.color = f.color;
  if (f?.search?.trim()) params.search = f.search.trim();

  const res = await apiClient.get<MarkingApiResponse>("/markings/my-assigned/", {
    params,
    withCredentials: true,
    headers: { Accept: "application/json" },
  });
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Assigned catalog API: invalid response (missing results array)");
  }
  return {
    results: data.results.map(mapApiMarkingToRecord),
    count: data.count ?? null,
    next: data.next ?? null,
    previous: data.previous ?? null,
    count_capped: data.count_capped,
  };
}

/** GET /markings/{id}/ - returns the canonical detail shape. */
export async function getMarkingById(markingId: number): Promise<MarkingRecord | null> {
  try {
    const res = await apiClient.get(`/markings/${markingId}/`);
    return mapApiMarkingToRecord(res.data);
  } catch {
    return null;
  }
}

/** Raw detail payload (snake_case) for callers that need server fields directly. */
export async function getMarkingByIdRaw(markingId: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await apiClient.get(`/markings/${markingId}/`);
    return (res.data ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/v2/images/{image_id}/ — update display_order on a single image.
 * Returns the updated MarkingImage on success, or null on failure.
 *
 * Used by the editor reorder controls on the Record Detail page. The
 * server's ImageViewSet is a plain ModelViewSet so PATCHing display_order
 * is the canonical lever for "which image is the Catalog Search thumbnail"
 * (display_order=0) and "what order do thumbnails appear in the Associated
 * Thumbnails strip".
 */
export async function updateImageDisplayOrder(
  imageId: number,
  displayOrder: number,
): Promise<MarkingImage | null> {
  try {
    const res = await apiClient.patch(
      `/images/${imageId}/`,
      { display_order: displayOrder },
      {
        withCredentials: true,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );
    return mapImage(res.data);
  } catch {
    return null;
  }
}

/**
 * Reassign display_order across an ordered list of image IDs in one round
 * of parallel PATCHes (index 0 -> display_order=0, index 1 -> 1, etc.).
 * Returns true when every PATCH succeeded so callers know whether to
 * refetch the marking or surface an error to the user.
 */
export async function reorderImages(
  imageIdsInOrder: number[],
): Promise<boolean> {
  if (imageIdsInOrder.length === 0) return true;
  const results = await Promise.all(
    imageIdsInOrder.map((id, idx) => updateImageDisplayOrder(id, idx)),
  );
  return results.every((row) => row !== null);
}

export async function getMarkingChangelog(markingId: number): Promise<MarkingChangelogResponse | null> {
  try {
    const res = await apiClient.get<MarkingChangelogResponse>(
      `/markings/${markingId}/changelog/`,
      {
        withCredentials: true,
        headers: { Accept: "application/json" },
      }
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function restoreMarkingVersion(
  markingId: number,
  versionNo: number
): Promise<{ detail?: string; restored_from_version_no?: number; new_version_no?: number } | null> {
  try {
    const res = await apiClient.post(
      `/markings/${markingId}/restore-version/`,
      { version_no: versionNo },
      {
        withCredentials: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      }
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

/** A single CoverDate row attached to an associated cover. */
export interface AssociatedCoverDate {
  id: number;
  date: string;
  granularity: "DAY" | "MONTH" | "YEAR";
}

/** Cover attributes shown inside an Associated Cover row. */
export interface AssociatedCoverDetails {
  id: number;
  code: string | null;
  /**
   * FK id of the Color row (or null when no color is set). Carried alongside
   * colorName so the cover edit dialog can prefill the colour <Select>
   * (which is keyed by id) without a second round-trip.
   */
  colorId: number | null;
  colorName: string;
  type: string | null;
  width: string | null;
  height: string | null;
  hasAdhesive: boolean | null;
  isInstitutional: boolean | null;
  coverDates: AssociatedCoverDate[];
}

/** One CoverMarking row (a marking-on-cover association). */
export interface AssociatedCover {
  id: number;
  isBackstamp: boolean;
  placement: string | null;
  coverDetails: AssociatedCoverDetails | null;
}

interface CoverMarkingApiResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: unknown[];
}

function mapAssociatedCoverDate(raw: unknown): AssociatedCoverDate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = toIdOrNull(o.id);
  const date = typeof o.date === "string" ? o.date : "";
  if (id == null || !date) return null;
  const gRaw = String(o.granularity ?? "").toUpperCase();
  const granularity: AssociatedCoverDate["granularity"] =
    gRaw === "MONTH" ? "MONTH" : gRaw === "YEAR" ? "YEAR" : "DAY";
  return { id, date, granularity };
}

function mapAssociatedCoverDetails(raw: unknown): AssociatedCoverDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = toIdOrNull(o.id);
  if (id == null) return null;
  const datesRaw = Array.isArray(o.cover_dates) ? o.cover_dates : [];
  const coverDates = datesRaw
    .map(mapAssociatedCoverDate)
    .filter((x): x is AssociatedCoverDate => x !== null);
  return {
    id,
    code: typeof o.code === "string" && o.code ? o.code : null,
    colorId: toIdOrNull(o.color),
    colorName: toStr(o.color_name),
    type: typeof o.type === "string" && o.type ? o.type : null,
    width: decimalToString(o.width),
    height: decimalToString(o.height),
    hasAdhesive: o.has_adhesive == null ? null : Boolean(o.has_adhesive),
    isInstitutional: o.is_institutional == null ? null : Boolean(o.is_institutional),
    coverDates,
  };
}

function mapAssociatedCover(raw: unknown): AssociatedCover | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = toIdOrNull(o.id);
  if (id == null) return null;
  return {
    id,
    isBackstamp: Boolean(o.is_backstamp),
    placement:
      typeof o.placement === "string" && o.placement ? o.placement : null,
    coverDetails: mapAssociatedCoverDetails(o.cover_details),
  };
}

/**
 * GET /cover-markings/?marking={id} - covers associated with a marking.
 * Returns [] on error or empty.
 *
 * Example response item shape (snake_case in, camelCase out):
 *   {
 *     "id": 7,
 *     "is_backstamp": false,
 *     "placement": null,
 *     "cover_details": {
 *       "id": 12,
 *       "code": "C-1234",
 *       "color_name": "Black",
 *       "type": "FC",
 *       "width": "20.00",
 *       "height": "10.50",
 *       "has_adhesive": false,
 *       "is_institutional": null,
 *       "cover_dates": [
 *         { "id": 99, "date": "1851-04-12", "granularity": "DAY" }
 *       ]
 *     }
 *   }
 */
export async function getMarkingCovers(
  markingId: number
): Promise<AssociatedCover[]> {
  try {
    const res = await apiClient.get<CoverMarkingApiResponse>(
      "/cover-markings/",
      { params: { marking: String(markingId) } }
    );
    const results = Array.isArray(res.data?.results) ? res.data.results : [];
    return results
      .map(mapAssociatedCover)
      .filter((x): x is AssociatedCover => x !== null);
  } catch {
    return [];
  }
}

/** GET /markings/?page_size=1 - returns total marking count. */
export async function getMarkingCount(): Promise<number> {
  const res = await apiClient.get<MarkingApiResponse>("/markings/", {
    params: { page_size: "1" },
  });
  return typeof res.data.count === "number" ? res.data.count : 0;
}

/** GET /markings-range/ - earliest/latest cover_date year across catalog. */
export async function getMarkingYearRange(): Promise<MarkingYearRange> {
  const res = await apiClient.get<Record<string, number | null | undefined>>(
    "/markings-range/"
  );
  const data = res.data ?? {};
  const earliest = data.earliest_year ?? data.earliestYear;
  const latest = data.latest_year ?? data.latestYear;
  return {
    earliestYear: typeof earliest === "number" ? earliest : null,
    latestYear: typeof latest === "number" ? latest : null,
  };
}
