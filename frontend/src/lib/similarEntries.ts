/**
 * Pure helpers behind the "similar existing Entries" panels (T48).
 *
 * `describeSimilarMarking` turns an API row into a panel row. `findSimilarCovers`
 * is the whole Cover side: the Cover form collects only type and date, and the
 * parent Marking's sibling covers are already loaded, so matching happens here
 * with no round trip. Unknown is never evidence of a difference (same rule as
 * the backend's size comparison), which is why a year is required before
 * anything is suggested: with nothing typed every sibling would "match".
 */
import type { AssociatedCover } from "@/services/markings";
import type { SimilarMarking } from "@/services/similarEntries";
import type { SimilarRow } from "@/components/SimilarEntriesPanel";
import { buildCatalogSearchTitleFromParts, formatCatalogDate, markingTypeLabel } from "@/lib/catalogRecordDisplay";
import { COVER_TYPE_LABELS, DEFAULT_COVER_TYPE } from "@/lib/coverTypes";
import type { PartialDateInput } from "@/lib/partialDate";
import { isTrueCircleShapeName } from "@/lib/shapeDisplay";

export const MATCH_LABEL = "Looks like an existing Marking";
export const RELATED_LABEL = "Same town and inscription, different details";
export const COVER_MATCH_LABEL = "Same type and date";
export const COVER_POSSIBLE_LABEL = "Possibly the same cover";

function sizeText(row: SimilarMarking): string {
  const w = row.width?.trim() || "";
  const h = row.height?.trim() || "";
  if (!row.isManuscript && isTrueCircleShapeName(row.shapeName) && (w || h)) {
    return `${w || h} mm diameter`;
  }
  if (w && h) return `${w}x${h} mm`;
  if (w || h) return `${w || h} mm`;
  return "";
}

function datesText(row: SimilarMarking): string {
  const first = row.earliestSeen ? formatCatalogDate(row.earliestSeen) : "";
  const last = row.latestSeen ? formatCatalogDate(row.latestSeen) : "";
  if (first && last && first !== last) return `${first} – ${last}`;
  return first || last;
}

export function describeSimilarMarking(row: SimilarMarking): SimilarRow {
  const detail = [
    markingTypeLabel(row.type),
    row.isManuscript ? "Manuscript" : row.shapeName,
    row.colorName,
    sizeText(row),
    datesText(row),
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  return {
    id: row.id,
    href: `/record/${row.id}`,
    title: buildCatalogSearchTitleFromParts({
      town: row.town,
      region: row.stateAbbrev,
      inscription: row.inscription,
    }),
    detail,
    thumbnailUrl: row.mainImageUrl,
    tierLabel: row.tier === "match" ? MATCH_LABEL : RELATED_LABEL,
  };
}

// ---------------------------------------------------------------- covers

function knownType(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").trim().toUpperCase();
  return code && code !== DEFAULT_COVER_TYPE ? code : null;
}

/** A typed date part, or null; zero is rejected on purpose (no year, month or day 0). */
function toInt(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Equal where both sides know the component; unknown never separates. */
function dateCompatible(
  typed: { year: number; month: number | null; day: number | null },
  sibling: { dateYear: number | null; dateMonth: number | null; dateDay: number | null },
): boolean {
  if (sibling.dateYear != null && sibling.dateYear !== typed.year) return false;
  if (typed.month != null && sibling.dateMonth != null && sibling.dateMonth !== typed.month) return false;
  if (typed.day != null && sibling.dateDay != null && sibling.dateDay !== typed.day) return false;
  return true;
}

export function findSimilarCovers(
  siblings: AssociatedCover[],
  typed: { type: string; coverDate: PartialDateInput },
  markingId: number,
  excludeCoverId: number | null,
): SimilarRow[] {
  const year = typed.coverDate.unknown ? null : toInt(typed.coverDate.year);
  if (year == null) return [];
  const month = toInt(typed.coverDate.month);
  const day = toInt(typed.coverDate.day);
  const typedType = knownType(typed.type);

  const rows: SimilarRow[] = [];
  for (const sibling of siblings) {
    const details = sibling.coverDetails;
    if (!details || details.id === excludeCoverId) continue;
    const siblingType = knownType(details.type);
    if (typedType && siblingType && typedType !== siblingType) continue;
    const dated = details.datesSeen.filter((d) => d.dateYear != null);
    const dateMatches = dated.length === 0 || dated.some((d) => dateCompatible({ year, month, day }, d));
    if (!dateMatches) continue;

    const exact = Boolean(typedType && siblingType) && dated.length > 0;
    const typeLabel = siblingType ? COVER_TYPE_LABELS[siblingType] ?? siblingType : "Type unknown";
    const dateLabel = dated.length
      ? dated.map((d) => formatCatalogDate(d.date) || String(d.dateYear)).join(", ")
      : "Date unknown";
    rows.push({
      id: details.id,
      href: `/record/${markingId}/cover/${details.id}`,
      title: details.code ? `Cover ${details.code}` : `Cover #${details.id}`,
      detail: [typeLabel, dateLabel, details.colorName].filter(Boolean).join(" · "),
      thumbnailUrl: null,
      tierLabel: exact ? COVER_MATCH_LABEL : COVER_POSSIBLE_LABEL,
    });
  }
  return rows;
}
