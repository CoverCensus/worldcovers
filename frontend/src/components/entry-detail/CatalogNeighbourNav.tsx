import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogNeighbour, CatalogNeighbours } from "@/hooks/useCatalogNeighbours";

/**
 * Previous / Next through the catalog list a marking was opened from
 * (Trello T95). Renders nothing when there is no list context.
 */
export function CatalogNeighbourNav({
  neighbours,
  onStep,
  focus = null,
}: {
  neighbours: CatalogNeighbours | null;
  onStep: (neighbour: CatalogNeighbour, direction: "previous" | "next") => void;
  /** The control the viewer just used: it takes focus again on the new page
   *  (the record page remounts per id, so focus would otherwise drop to body). */
  focus?: "previous" | "next" | null;
}) {
  if (!neighbours) return null;
  const { previous, next, position } = neighbours;
  return (
    <nav aria-label="Catalog neighbours" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Previous marking"
        disabled={previous == null}
        autoFocus={focus === "previous"}
        onClick={() => previous && onStep(previous, "previous")}
      >
        <ArrowLeft aria-hidden="true" />
        Previous
      </Button>
      {position && (
        <span className="whitespace-nowrap px-1">
          Record {position.n.toLocaleString()} of {position.total.toLocaleString()}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Next marking"
        disabled={next == null}
        autoFocus={focus === "next"}
        onClick={() => next && onStep(next, "next")}
      >
        Next
        <ArrowRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
