import { ArrowDown, ArrowUp, Crop, Replace, Stamp, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImageActionState } from "@/lib/imageActionState";

/**
 * The per-thumbnail action cluster on the marking detail screen: reorder, set
 * default, crop, move to a cover, move to another marking, delete.
 *
 * Lifted out of RecordDetail.tsx for issues.md 166. Two reasons, both load
 * bearing:
 *
 * 1. The controls used to disappear entirely when an image had no catalog id,
 *    with nothing on screen saying why. They now render disabled with a stated
 *    reason, which is the fix.
 * 2. As inline JSX inside a ~2,000 line page this was untestable. As a
 *    presentational component with no Radix primitives it can be rendered
 *    directly in jsdom.
 *
 * The frontend gates here are a UX convenience. The backend enforces the real
 * rule independently -- IsEditorOrAdminWrite on the Image viewset.
 */
export function ThumbnailImageActions({
  state,
  canReorder,
  isFirst,
  isLast,
  isDefault,
  reordering,
  deleting,
  canMoveToCover,
  canMoveToMarking,
  onMoveBy,
  onSetDefault,
  onCrop,
  onMoveToCover,
  onMoveToMarking,
  onDelete,
}: {
  state: ImageActionState;
  canReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDefault: boolean;
  reordering: boolean;
  deleting: boolean;
  /** A cover exists to move this image to. */
  canMoveToCover: boolean;
  /** A sibling marking exists at this post office to move this image to. */
  canMoveToMarking: boolean;
  onMoveBy: (offset: -1 | 1) => void;
  onSetDefault: () => void;
  onCrop: () => void;
  onMoveToCover: () => void;
  onMoveToMarking: () => void;
  onDelete: () => void;
}) {
  // A visitor without editor rights sees nothing at all. A disabled control
  // still advertises a capability, which is misleading rather than helpful.
  if (!state.showControls) return null;

  // Every action needs a saved image to act on, so one reason disables them
  // all. Reorder is included: reordering an image that is not in the catalog
  // has nothing to persist.
  const blocked = state.disabledReason != null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {canReorder && (
        <div className="flex items-center justify-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move thumbnail left"
            disabled={reordering || blocked || isFirst}
            onClick={() => onMoveBy(-1)}
          >
            <ArrowUp className="h-3 w-3 -rotate-90" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move thumbnail right"
            disabled={reordering || blocked || isLast}
            onClick={() => onMoveBy(1)}
          >
            <ArrowDown className="h-3 w-3 -rotate-90" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={
              isDefault
                ? "h-6 w-6 text-amber-600 hover:text-amber-600 disabled:opacity-100"
                : "h-6 w-6"
            }
            aria-label="Set as default catalog thumbnail"
            title={isDefault ? "Default catalog thumbnail" : "Set as default catalog thumbnail"}
            disabled={reordering || blocked || isDefault}
            onClick={onSetDefault}
          >
            <Star className={`h-3 w-3 ${isDefault ? "fill-amber-500 text-amber-500" : ""}`} />
          </Button>
        </div>
      )}
      <div className="flex items-center justify-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Crop the marking out of this image"
          title="Crop marking"
          disabled={reordering || blocked}
          onClick={onCrop}
        >
          <Crop className="h-3 w-3" />
        </Button>
        {canMoveToCover && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move image to a cover entry"
            title="Move to cover"
            disabled={reordering || blocked}
            onClick={onMoveToCover}
          >
            <Replace className="h-3 w-3" />
          </Button>
        )}
        {canMoveToMarking && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move image to another marking"
            title="Move to another marking"
            disabled={reordering || blocked}
            onClick={onMoveToMarking}
          >
            <Stamp className="h-3 w-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          aria-label="Delete image"
          title="Delete image"
          disabled={reordering || blocked || deleting}
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {state.disabledReason && (
        // Rendered as text, not only as a `title` tooltip. A tooltip on a
        // disabled button is unreliable to reach and invisible to anyone not
        // hovering -- which is the failure mode issues.md 166 is about.
        <p className="max-w-[10rem] text-center text-[10px] leading-tight text-muted-foreground">
          {state.disabledReason}
        </p>
      )}
    </div>
  );
}

export default ThumbnailImageActions;
