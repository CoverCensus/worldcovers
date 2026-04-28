import type { CatalogFieldValues } from "@/lib/catalogRecordDisplay";

/**
 * Fixed catalog fields for Catalog Search (list/gallery) and Record Detail.
 * Always shows all labels; values use — when empty (see `buildCatalogFieldValues`).
 *
 * Labeling note: “Postmark type” is the legacy ASCC outline / filter type (postmark_shape).
 * “Lettering” and “Framing” come from API lettering_style / framing_style; legacy `shape_lettering`
 * may appear under Lettering when structured names are missing.
 */
export function CatalogRecordFields({ row }: { row: CatalogFieldValues }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div className="min-w-0">
        <span className="text-muted-foreground">Type:</span>{" "}
        <span className="text-foreground break-words">{row.type}</span>
      </div>
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
      <div className="min-w-0">
        <span className="text-muted-foreground">Color:</span>{" "}
        <span className="text-foreground break-words">{row.color}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Earliest Seen:</span>{" "}
        <span className="text-foreground break-words">{row.earliestUse}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Latest Seen:</span>{" "}
        <span className="text-foreground break-words">{row.latestUse}</span>
      </div>
    </dl>
  );
}
