import type { CatalogFieldValues } from "@/lib/catalogRecordDisplay";
import type { MarkingRecord } from "@/services/markings";

/**
 * Fixed catalog fields for Catalog Search (list) and Record Detail.
 * Always shows all labels; values use the empty marker when missing
 * (see `buildCatalogFieldValues`). Eight fields lay out as a 2-column
 * grid (Type/Manuscript, Shape/Lettering, Dimensions/Color,
 * Earliest/Latest), so Earliest/Latest sit in normal grid cells rather
 * than a flush-right footer row.
 */
function truncateWithEllipsis(value: string, maxChars: number): string {
  const s = String(value ?? "").trim();
  if (!s) return s;
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function CatalogRecordFields({
  row,
  record,
  variant = "search",
}: {
  row: CatalogFieldValues;
  record?: MarkingRecord;
  variant?: "search" | "detail";
}) {
  const isManuscript = record?.isManuscript === true;
  const isNonTownmark = record ? record.type !== "TOWNMARK" : false;
  const hidePhysicalFieldsOnSearch = variant === "search" && (isManuscript || isNonTownmark);
  const descForSearch = truncateWithEllipsis(row.desc === "-" ? "" : row.desc, 140);

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div className="min-w-0">
        <span className="text-muted-foreground">Type:</span>{" "}
        <span className="text-foreground break-words">{row.type}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Manuscript:</span>{" "}
        <span className="text-foreground break-words">{row.manuscript}</span>
      </div>

      {hidePhysicalFieldsOnSearch ? (
        <>
          <div className="min-w-0 sm:col-span-2">
            <span className="text-muted-foreground">Description:</span>{" "}
            <span className="text-foreground break-words">{descForSearch || "-"}</span>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <span className="text-muted-foreground">Shape:</span>{" "}
            <span className="text-foreground break-words">{row.shape}</span>
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Lettering style:</span>{" "}
            <span className="text-foreground break-words">{row.lettering}</span>
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Dimensions:</span>{" "}
            <span className="text-foreground break-words">{row.dimensions}</span>
          </div>
        </>
      )}

      <div className="min-w-0">
        <span className="text-muted-foreground">Color:</span>{" "}
        <span className="text-foreground break-words">{row.color}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Earliest Seen:</span>{" "}
        <span className="text-foreground break-words">{row.earliestSeen}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Latest Seen:</span>{" "}
        <span className="text-foreground break-words">{row.latestSeen}</span>
      </div>
    </dl>
  );
}
