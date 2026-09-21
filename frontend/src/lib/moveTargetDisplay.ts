/**
 * Turning a move-image destination into something an editor can recognise --
 * issues.md 114 / Trello T38.
 *
 * Both pickers on the marking detail screen used to render a bare catalog code
 * and nothing else. Every candidate in the marking picker is a sibling at the
 * same post office, so the town is identical by construction and the code is
 * the only thing on offer: `ASCC6-VA-M2110` against `ASCC6-VA-M2147`, 147 of
 * them at Richmond, in catalog order. `Marking.code` is nullable too, so some
 * rows read `Marking #31153`.
 *
 * The fields here are built through `buildCatalogSearchRow` rather than read
 * off the record directly, so a picker row and a Catalog Search card can never
 * disagree about what a marking looks like. That helper already owns the
 * awkward parts -- notably that true circles display as a diameter rather than
 * WxH.
 *
 * Nothing here fetches. Every field is already in memory: the sibling-candidate
 * effect pages the whole post office into `moveMarkingCandidates`, and
 * `MarkingListSerializer` sends `main_image`, `inscription_txt`, `size_display`,
 * `shape_name`, `color_name` and `type` with it.
 */
import {
  buildCatalogSearchRow,
  CATALOG_FIELD_EMPTY,
  formatDateSeen,
} from "@/lib/catalogRecordDisplay";
import type { AssociatedCover, MarkingRecord } from "@/services/markings";
import { normalizeImageUrl } from "@/services/markings";

export interface MoveTargetDescription {
  /** Catalog pk of the destination. */
  id: number;
  /** The catalog code, or a record-number fallback when the code is null. */
  title: string;
  /** The line that actually distinguishes one same-town sibling from another. */
  detail: string;
  thumbnailUrl: string | null;
  /** Lowercased haystack for the filter box: code plus everything in `detail`. */
  searchText: string;
}

/** Drop the catalog's "-" placeholder and any blanks, then join what is left. */
function detailLine(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0 && p !== CATALOG_FIELD_EMPTY)
    .join(" · ");
}

function describe(
  id: number,
  code: string | null | undefined,
  fallbackNoun: string,
  detail: string,
  thumbnailUrl: string | null,
): MoveTargetDescription {
  const trimmed = (code ?? "").trim();
  const title = trimmed.length > 0 ? trimmed : `${fallbackNoun} #${id}`;
  return {
    id,
    title,
    detail,
    thumbnailUrl,
    searchText: `${title} ${detail}`.toLowerCase(),
  };
}


/**
 * A marking as a move destination: thumbnail, code (or a record-number
 * fallback) and the line that actually distinguishes same-town siblings.
 *
 * Built through `buildCatalogSearchRow` rather than off the record directly, so
 * a picker row and a Catalog Search card cannot disagree about what a marking
 * looks like -- that helper already owns the awkward parts, notably that true
 * circles display as a diameter rather than WxH.
 *
 * Its original consumer (the marking screen's "move to another marking"
 * picker) was removed on 2026-09-21 at Ian's request. It now serves the COVER
 * screen's "Move Image to Marking" picker, which had the identical code-only
 * defect and simply had not been reported yet.
 */
export function describeMarkingTarget(
  marking: MarkingRecord,
  thumbnailUrlOverride?: string | null,
): MoveTargetDescription {
  const row = buildCatalogSearchRow(marking);
  return describe(
    marking.id,
    marking.code,
    "Marking",
    detailLine([row.type, row.markingTextSingle, row.shape, row.dimensions, row.color]),
    thumbnailUrlOverride ?? row.image,
  );
}

export function describeCoverTarget(cover: AssociatedCover): MoveTargetDescription {
  const details = cover.coverDetails;
  const id = details?.id ?? cover.id;

  const dates = (details?.datesSeen ?? [])
    .map((d) =>
      formatDateSeen(d.date, d.granularity, {
        dateYear: d.dateYear,
        dateMonth: d.dateMonth,
        dateDay: d.dateDay,
      }) || d.date || "",
    )
    .filter(Boolean)
    .join(", ");

  const dimensions = [details?.width, details?.height]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join("x");

  return describe(
    id,
    details?.code,
    "Cover",
    detailLine([
      coverTypeLabel(details?.type ?? null),
      dimensions ? `${dimensions} mm` : "",
      details?.colorName,
      dates,
    ]),
    normalizeImageUrl(cover.defaultImageUrl),
  );
}

/** ASCC cover-type codes. Matches the marking detail screen's own wording. */
function coverTypeLabel(t: string | null): string {
  if (t === "FC") return "Folded Cover";
  if (t === "FL") return "Folded Letter";
  return "";
}

/**
 * Substring match over code and detail, so an editor can find a destination by
 * its inscription, shape or colour without knowing a code at all -- T38's
 * stated acceptance. An empty query matches everything.
 */
export function filterMoveTargets<T extends MoveTargetDescription>(
  targets: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return targets;
  return targets.filter((t) => t.searchText.includes(needle));
}

/**
 * Order by code the way a person reads it: `M9` before `M10`, not after.
 *
 * issues.md 114 recorded the picker as being in the catalog's default sort,
 * where `ASCC6-VA-M2560` sat at row 60 and `ASCC6-VA-M2147` sat last, so
 * finding a known code meant scanning all 147 rows.
 *
 * Codeless records sort last: a `Marking #31153` fallback carries no catalog
 * position, and interleaving those among real codes would undo the ordering.
 */
export function compareMarkingTargets(
  a: MoveTargetDescription,
  b: MoveTargetDescription,
): number {
  const aFallback = a.title.startsWith("Marking #") || a.title.startsWith("Cover #");
  const bFallback = b.title.startsWith("Marking #") || b.title.startsWith("Cover #");
  if (aFallback !== bFallback) return aFallback ? 1 : -1;
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
}
