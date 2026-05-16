/**
 * Covers (v2 Cover entity): GET /covers/, plus full CRUD over the cover
 * graph (Cover, CoverMarking link, CoverDate child rows) used by the cover
 * add/edit dialog on the Record Detail page.
 */
import apiClient, { ensureCsrfToken } from "@/lib/api";

/** One item from GET /covers/ (DRF snake_case) */
export interface CoverApiResultItem {
  cover_id: number;
  cover_key: string;
  owner_username: string;
  postmark_count: number;
  created_date: string;
}

/** Paginated response from GET /covers/ */
export interface CoverApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CoverApiResultItem[];
}

/** Normalized cover for list/detail */
export interface CoverRecord {
  id: number;
  coverKey: string;
  ownerUsername: string;
  postmarkCount: number;
  createdDate: string;
}

function mapApiResultToRecord(item: CoverApiResultItem): CoverRecord {
  return {
    id: item.cover_id,
    coverKey: item.cover_key,
    ownerUsername: item.owner_username,
    postmarkCount: item.postmark_count,
    createdDate: item.created_date,
  };
}

/**
 * Fetches covers from GET /covers/.
 */
export async function getCovers(): Promise<CoverRecord[]> {
  const res = await apiClient.get<CoverApiResponse>("/covers/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Covers API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}

/* -------------------------------------------------------------------------
 * Write API for the Cover graph
 *
 * The backend exposes three sibling resources that together describe a
 * marking's covers:
 *   * /covers/         — the Cover row itself (code, color, type, dims, …)
 *   * /cover-markings/ — the link row tying a Cover to a Marking, with
 *                        is_backstamp/placement
 *   * /cover-dates/    — N "this cover was used on <date>" rows
 *
 * The dialog drives all three from a single form, so the helpers below are
 * intentionally thin: they each map to one HTTP verb on one resource. The
 * dialog orchestrates the multi-call sequencing (create cover -> link it ->
 * write dates, or PATCH-then-diff dates for edit).
 *
 * `ensureCsrfToken()` is called before each unsafe verb so that a user who
 * just landed on the page (and therefore has no `csrftoken` cookie yet)
 * doesn't get a confusing 403 on the first save. Once the cookie is in
 * place axios picks it up via xsrfCookieName/xsrfHeaderName.
 * ----------------------------------------------------------------------- */

/** Body shape accepted by both POST and PATCH for /covers/. */
export interface CoverWritePayload {
  code?: string | null;
  /** Color FK id; null clears the colour. */
  color?: number | null;
  /** "FC" (Folded Cover) or "FL" (Folded Letter); null clears the choice. */
  type?: string | null;
  has_adhesive?: boolean;
  is_institutional?: boolean | null;
  /** Decimal mm; send "" or null to clear. */
  width?: string | number | null;
  height?: string | number | null;
}

/** Minimal response shape from /covers/ writes. */
export interface CoverWriteResult {
  id: number;
  code: string | null;
  color: number | null;
  type: string | null;
  has_adhesive: boolean;
  is_institutional: boolean | null;
  width: string | null;
  height: string | null;
}

/** POST /covers/ — create a new Cover row. */
export async function createCover(
  payload: CoverWritePayload,
): Promise<CoverWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.post<CoverWriteResult>("/covers/", payload);
  return res.data;
}

/** PATCH /covers/{id}/ — partial update of an existing Cover row. */
export async function updateCover(
  id: number,
  payload: CoverWritePayload,
): Promise<CoverWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.patch<CoverWriteResult>(
    `/covers/${id}/`,
    payload,
  );
  return res.data;
}

/** DELETE /covers/{id}/ — destroy a Cover (cascades to dates + valuations). */
export async function deleteCover(id: number): Promise<void> {
  await ensureCsrfToken();
  await apiClient.delete(`/covers/${id}/`);
}

/** Body shape accepted by both POST and PATCH for /cover-markings/. */
export interface CoverMarkingWritePayload {
  cover?: number;
  marking?: number;
  is_backstamp?: boolean;
  placement?: string | null;
  contributor_comment?: string | null;
}

export interface CoverMarkingWriteResult {
  id: number;
  cover: number;
  marking: number;
  is_backstamp: boolean;
  placement: string | null;
}

/** POST /cover-markings/ — link a Cover to a Marking. */
export async function createCoverMarking(
  payload: CoverMarkingWritePayload,
): Promise<CoverMarkingWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.post<CoverMarkingWriteResult>(
    "/cover-markings/",
    payload,
  );
  return res.data;
}

/** PATCH /cover-markings/{id}/ — update is_backstamp/placement. */
export async function updateCoverMarking(
  id: number,
  payload: CoverMarkingWritePayload,
): Promise<CoverMarkingWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.patch<CoverMarkingWriteResult>(
    `/cover-markings/${id}/`,
    payload,
  );
  return res.data;
}

/** DELETE /cover-markings/{id}/ — drop only the link, keep the Cover row. */
export async function deleteCoverMarking(id: number): Promise<void> {
  await ensureCsrfToken();
  await apiClient.delete(`/cover-markings/${id}/`);
}

/** Granularity matches CoverDate.GRANULARITY_CHOICES on the backend. */
export type CoverDateGranularity = "DAY" | "MONTH" | "YEAR";

/** Body shape accepted by both POST and PATCH for /cover-dates/. */
export interface CoverDateWritePayload {
  cover?: number;
  /** ISO date string (YYYY-MM-DD); month/year granularity uses YYYY-MM-01 / YYYY-01-01. */
  date?: string;
  granularity?: CoverDateGranularity;
}

export interface CoverDateWriteResult {
  id: number;
  cover: number;
  date: string;
  granularity: CoverDateGranularity;
}

/** POST /cover-dates/ — attach a date to a Cover. */
export async function createCoverDate(
  payload: CoverDateWritePayload,
): Promise<CoverDateWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.post<CoverDateWriteResult>(
    "/cover-dates/",
    payload,
  );
  return res.data;
}

/** PATCH /cover-dates/{id}/ — adjust date or granularity in place. */
export async function updateCoverDate(
  id: number,
  payload: CoverDateWritePayload,
): Promise<CoverDateWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.patch<CoverDateWriteResult>(
    `/cover-dates/${id}/`,
    payload,
  );
  return res.data;
}

/** DELETE /cover-dates/{id}/ — remove a single date row. */
export async function deleteCoverDate(id: number): Promise<void> {
  await ensureCsrfToken();
  await apiClient.delete(`/cover-dates/${id}/`);
}

/* -------------------------------------------------------------------------
 * Cover detail (read)
 * ----------------------------------------------------------------------- */

export interface CoverDateSeenItem {
  id: number;
  date: string;
  granularity: "DAY" | "MONTH" | "YEAR";
}

function mapCoverDateSeen(raw: unknown): CoverDateSeenItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "number" ? o.id : Number(o.id);
  if (!Number.isFinite(id)) return null;
  const date = typeof o.date === "string" ? o.date : "";
  if (!date) return null;
  const gRaw = String(o.granularity ?? "").toUpperCase();
  const granularity: CoverDateSeenItem["granularity"] =
    gRaw === "MONTH" ? "MONTH" : gRaw === "YEAR" ? "YEAR" : "DAY";
  return { id: id as number, date, granularity };
}

function decimalToString(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  return s || null;
}

function toIdOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalized GET /covers/{id}/ payload (aligned with AssociatedCoverDetails). */
export interface CoverDetail {
  id: number;
  code: string | null;
  colorId: number | null;
  colorName: string;
  type: string | null;
  hasAdhesive: boolean;
  isInstitutional: boolean | null;
  width: string | null;
  height: string | null;
  datesSeen: CoverDateSeenItem[];
  createdDate: string;
  modifiedDate: string;
}

function mapCoverDetail(data: unknown): CoverDetail | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const id = toIdOrNull(o.id);
  if (id == null) return null;
  const colorName =
    typeof o.color_name === "string" ? o.color_name : "";
  const datesRaw = Array.isArray(o.dates_seen) ? o.dates_seen : [];
  const datesSeen = datesRaw
    .map(mapCoverDateSeen)
    .filter((x): x is CoverDateSeenItem => x !== null);
  const hasAdhesive = o.has_adhesive == null ? false : Boolean(o.has_adhesive);
  return {
    id,
    code: typeof o.code === "string" && o.code ? o.code : null,
    colorId: toIdOrNull(o.color),
    colorName,
    type: typeof o.type === "string" && o.type ? o.type : null,
    hasAdhesive,
    isInstitutional:
      o.is_institutional == null ? null : Boolean(o.is_institutional),
    width: decimalToString(o.width),
    height: decimalToString(o.height),
    datesSeen,
    createdDate:
      typeof o.created_date === "string" ? o.created_date : "",
    modifiedDate:
      typeof o.modified_date === "string" ? o.modified_date : "",
  };
}

/** GET /covers/{id}/ — read a single cover row. */
export async function getCoverById(coverId: number): Promise<CoverDetail | null> {
  try {
    const res = await apiClient.get(`/covers/${coverId}/`);
    return mapCoverDetail(res.data);
  } catch {
    return null;
  }
}
