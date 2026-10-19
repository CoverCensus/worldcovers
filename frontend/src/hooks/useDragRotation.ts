import { useRef, type PointerEvent, type RefObject } from "react";

import { angleDelta, pointerAngle, snapAngle } from "@/lib/imageRotation";

interface DragRotationOptions {
  /** The running angle in clockwise degrees; unbounded, so it can go round and round. */
  angle: number;
  onChange: (degrees: number) => void;
  /** The element whose centre the image turns about. */
  pivotRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

/**
 * Pointer handlers that turn an image by dragging around its centre
 * (workspace issue #193). Each move adds the change in pointer direction to a
 * running angle, so turning past a full circle keeps going in either
 * direction. The angle snaps to upright and right angles within SNAP_DEGREES;
 * holding Alt turns the snap off. Pointer capture keeps the drag alive when
 * the pointer leaves the handle.
 */
export function useDragRotation({ angle, onChange, pivotRef, disabled }: DragRotationOptions) {
  const drag = useRef<{ pointer: number; raw: number } | null>(null);

  const directionOf = (event: PointerEvent<HTMLElement>) => {
    const box = pivotRef.current?.getBoundingClientRect();
    if (!box) return null;
    return pointerAngle(
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      { x: event.clientX, y: event.clientY },
    );
  };

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return;
      const pointer = directionOf(event);
      if (pointer === null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { pointer, raw: angle };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) return;
      const pointer = directionOf(event);
      if (pointer === null) return;
      current.raw += angleDelta(current.pointer, pointer);
      current.pointer = pointer;
      onChange(event.altKey ? current.raw : snapAngle(current.raw));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      drag.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
}
