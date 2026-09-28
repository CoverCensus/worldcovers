/**
 * Write client for /dates-seen/ (issues.md 107): the marking page's Dates seen
 * card adds, corrects and removes one DateSeen row per click, on the existing
 * region-scoped, audited API (issue #128).
 *
 * Two rules the serializer imposes, both easy to get wrong from a client:
 *  - send the three parts (`date_year`, `date_month`, `date_day`), never a
 *    synthesised `date` -- partial precisions such as MONTH_ONLY have no date;
 *  - send ALL three on an update, null for a cleared part, and no
 *    `granularity`: a part that is not sent is kept from the stored row, and
 *    the server derives the precision from the parts it receives.
 */
import apiClient from "@/lib/api";
import type { AssociatedDateSeen } from "@/services/markings";
import type { PartialDateInput } from "@/lib/partialDate";

export type DateSeenSubjectType = "MARKING" | "COVER";

function part(text: string): number | null {
  const t = text.trim();
  return t ? Number.parseInt(t, 10) : null;
}

function partsPayload(parts: PartialDateInput) {
  return {
    date_year: part(parts.year),
    date_month: part(parts.month),
    date_day: part(parts.day),
  };
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number.parseInt(v, 10);
  return null;
}

function mapRow(raw: unknown): AssociatedDateSeen {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: toInt(o.id) ?? 0,
    date: typeof o.date === "string" ? o.date : null,
    granularity: String(o.granularity ?? "YEAR") as AssociatedDateSeen["granularity"],
    dateYear: toInt(o.date_year),
    dateMonth: toInt(o.date_month),
    dateDay: toInt(o.date_day),
  };
}

export async function createDateSeen(input: {
  subjectType: DateSeenSubjectType;
  subjectId: number;
  parts: PartialDateInput;
}): Promise<AssociatedDateSeen> {
  const res = await apiClient.post("/dates-seen/", {
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    ...partsPayload(input.parts),
  });
  return mapRow(res.data);
}

export async function updateDateSeen(id: number, parts: PartialDateInput): Promise<AssociatedDateSeen> {
  const res = await apiClient.patch(`/dates-seen/${id}/`, partsPayload(parts));
  return mapRow(res.data);
}

export async function deleteDateSeen(id: number): Promise<void> {
  await apiClient.delete(`/dates-seen/${id}/`);
}

/**
 * One message out of the three 400 shapes the endpoint produces:
 * `{non_field_errors: [...]}` (duplicate), `{detail: "..."}` (permission /
 * race backstop) and field-keyed `{date_day: [...]}` (validation).
 */
export function dateSeenErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    for (const value of Object.values(d)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "string") return value[0];
      if (typeof value === "string") return value;
    }
  }
  return err instanceof Error && err.message ? err.message : "Could not save the date.";
}
