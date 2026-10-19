import type { KeyboardEvent, RefObject } from "react";
import { RotateCcw, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDragRotation } from "@/hooks/useDragRotation";
import { normalizeAngle } from "@/lib/imageRotation";

interface RotateControlsProps {
  /** The running angle in clockwise degrees; unbounded. */
  angle: number;
  onChange: (degrees: number) => void;
  /** The element whose centre the image turns about while the dial is dragged. */
  pivotRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

/**
 * The rotate handle (workspace issue #193): a dial to grab and drag round the
 * image's centre, any angle, as many turns as you like, plus 90-degree
 * shortcuts and a reset. Shared by the Rotate tool and the crop dialogs.
 *
 * The dial is a slider for keyboard users: arrows turn 1 degree, Shift+arrows
 * 15, Home returns to upright.
 */
export function RotateControls({ angle, onChange, pivotRef, disabled }: RotateControlsProps) {
  const drag = useDragRotation({ angle, onChange, pivotRef, disabled });
  const shown = normalizeAngle(angle);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 1;
    const by: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
    } else if (event.key in by) {
      event.preventDefault();
      onChange(angle + by[event.key]);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(angle - 90)}>
          <RotateCcw />
          Turn 90° left
        </Button>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Rotate handle"
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={shown}
          aria-valuetext={`${shown.toFixed(1)} degrees`}
          aria-disabled={disabled || undefined}
          title="Drag round to rotate. Hold Alt to turn off snapping."
          className="relative h-12 w-12 shrink-0 cursor-grab touch-none select-none rounded-full border-2 border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onKeyDown={disabled ? undefined : handleKeyDown}
          {...drag}
        >
          {/* The needle points where the image's top edge now points. */}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ transform: `rotate(${shown}deg)` }}
          >
            <span className="absolute left-1/2 top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-primary" />
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(angle + 90)}>
          <RotateCw />
          Turn 90° right
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {shown.toFixed(1)}°
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          disabled={disabled || shown === 0}
          onClick={() => onChange(0)}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

export default RotateControls;
