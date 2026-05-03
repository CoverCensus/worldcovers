import type { CatalogFieldValues } from "@/lib/catalogRecordDisplay";

/**
 * Fixed catalog fields for Catalog Search (list) and Record Detail.
 * Always shows all labels; values use the empty marker when missing
 * (see `buildCatalogFieldValues`). Earliest/Latest sit on a footer row,
 * flush left and right.
 */
export function CatalogRecordFields({ row }: { row: CatalogFieldValues }) {
  return (
    <div className="space-y-2">
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
      </dl>
      <div className="flex justify-between items-baseline gap-4 text-sm">
        <div className="min-w-0">
          <span className="text-muted-foreground">Earliest Seen:</span>{" "}
          <span className="text-foreground">{row.earliestSeen}</span>
        </div>
        <div className="min-w-0 text-right">
          <span className="text-muted-foreground">Latest Seen:</span>{" "}
          <span className="text-foreground">{row.latestSeen}</span>
        </div>
      </div>
    </div>
  );
}
