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
}: {
  neighbours: CatalogNeighbours | null;
  onStep: (neighbour: CatalogNeighbour) => void;
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
        onClick={() => previous && onStep(previous)}
      >
        <ArrowLeft aria-hidden="true" />
        Previous
      </Button>
      {position && (
        <span aria-live="polite" className="whitespace-nowrap px-1">
          Record {position.n.toLocaleString()} of {position.total.toLocaleString()}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Next marking"
        disabled={next == null}
        onClick={() => next && onStep(next)}
      >
        Next
        <ArrowRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
