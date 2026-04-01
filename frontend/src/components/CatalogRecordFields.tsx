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
        <span className="text-muted-foreground">Town:</span>{" "}
        <span className="text-foreground break-words">{row.town}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">State:</span>{" "}
        <span className="text-foreground break-words">{row.state}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Manuscript:</span>{" "}
        <span className="text-foreground break-words">{row.manuscript}</span>
      </div>
      <div className="min-w-0">
        <span
          className="text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/40"
          title="Legacy catalog outline type (e.g. ASCC postmark shape). Same idea as the Postmark Type filter."
        >
          Postmark type:
        </span>{" "}
        <span className="text-foreground break-words">{row.type}</span>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <span className="text-muted-foreground">Postmark Text:</span>{" "}
        {row.postmarkTextLines.length > 1 ? (
          <ul className="list-disc pl-5 mt-1 text-foreground space-y-0.5 w-full">
            {row.postmarkTextLines.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-foreground break-words whitespace-pre-line">{row.postmarkTextSingle}</span>
        )}
      </div>
      {/* <div className="min-w-0">
        <span className="text-muted-foreground">Lettering:</span>{" "}
        <span className="text-foreground break-words">{row.lettering}</span>
      </div> */}
      <div className="min-w-0">
        <span className="text-muted-foreground">Framing/Lettering:</span>{" "}
        <span className="text-foreground break-words">{row.framing}/{row.lettering}</span>
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
        <span className="text-muted-foreground">Dates Seen:</span>{" "}
        <span className="text-foreground break-words">{row.datesSeen}</span>
      </div>
      <div className="min-w-0">
        <span className="text-muted-foreground">Earliest Use:</span>{" "}
        <span className="text-foreground break-words">{row.earliestUse}</span>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <span className="text-muted-foreground">Latest Use:</span>{" "}
        <span className="text-foreground break-words">{row.latestUse}</span>
      </div>
    </dl>
  );
}
