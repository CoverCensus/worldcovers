/**
 * Covers (v2 Cover entity): GET /covers/, plus full CRUD over the cover
 * graph (Cover, CoverMarking link, DateSeen child rows) used by the cover
 * add/edit dialog on the Record Detail page.
 *
 * Date observations now live in the polymorphic /dates-seen/ resource, keyed
 * by subject_type ("COVER" | "MARKING") and subject_id. For cover-bound dates
 * the helpers below pin subject_type to "COVER" and pass the Cover pk as
 * subject_id; the underlying row can also be attached to a Marking via a
 * direct subject_type="MARKING" call, but that flow is owned by the
 * marking-side editor, not this module.
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
 *   * /covers/         -- the Cover row itself (code, color, type, dims, ...)
 *   * /cover-markings/ -- the link row tying a Cover to a Marking, with
 *                         is_backstamp/placement
 *   * /dates-seen/     -- N "this subject was used on <date>" rows, with
 *                         subject_type="COVER" for cover-bound observations
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

/** Granularity matches DateSeen.GRANULARITY_CHOICES on the backend. */
export type DateSeenGranularity = "DAY" | "MONTH" | "YEAR";

/** Subject discriminator on the polymorphic /dates-seen/ resource. */
export type DateSeenSubjectType = "COVER" | "MARKING";

/** Body shape accepted by both POST and PATCH for /dates-seen/. */
export interface DateSeenWritePayload {
  /** Required on create; immutable on update. */
  subject_type?: DateSeenSubjectType;
  /** Required on create; immutable on update. PK of the Cover or Marking. */
  subject_id?: number;
  /** ISO date string (YYYY-MM-DD); month/year granularity uses YYYY-MM-01 / YYYY-01-01. */
  date?: string;
  granularity?: DateSeenGranularity;
}

export interface DateSeenWriteResult {
  id: number;
  subject_type: DateSeenSubjectType;
  subject_id: number;
  date: string;
  granularity: DateSeenGranularity;
}

/** POST /dates-seen/ -- attach a date observation to a Cover or Marking. */
export async function createDateSeen(
  payload: DateSeenWritePayload,
): Promise<DateSeenWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.post<DateSeenWriteResult>(
    "/dates-seen/",
    payload,
  );
  return res.data;
}

/** PATCH /dates-seen/{id}/ -- adjust date or granularity in place. */
export async function updateDateSeen(
  id: number,
  payload: DateSeenWritePayload,
): Promise<DateSeenWriteResult> {
  await ensureCsrfToken();
  const res = await apiClient.patch<DateSeenWriteResult>(
    `/dates-seen/${id}/`,
    payload,
  );
  return res.data;
}

/** DELETE /dates-seen/{id}/ -- remove a single date observation. */
export async function deleteDateSeen(id: number): Promise<void> {
  await ensureCsrfToken();
  await apiClient.delete(`/dates-seen/${id}/`);
}
