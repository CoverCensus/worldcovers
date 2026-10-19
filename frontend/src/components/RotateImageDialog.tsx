import { useRef, useState } from "react";

import { RotateControls } from "@/components/RotateControls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDragRotation } from "@/hooks/useDragRotation";
import { useElementSize } from "@/hooks/useElementSize";
import { normalizeAngle } from "@/lib/imageRotation";

interface RotateImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  description: string;
  /**
   * Save the turn: clockwise degrees in (-180, 180], never 0. `image` is the
   * loaded preview element. Resolve to an error message to keep the dialog
   * open, or null to close.
   */
  onSave: (angle: number, image: HTMLImageElement) => Promise<string | null>;
}

/**
 * Turn an image by any angle, previewed before one save (Trello T66; free
 * rotation since workspace issue #193, which replaced quarter turns).
 *
 * Drag the image -- or the rotate handle -- round its centre, as far as you
 * like in either direction. Shared by the catalog Marking and Cover pages
 * (saved on the server) and the upload forms (turned in the browser). The
 * preview is a CSS transform only; nothing is written until Save.
 */
export function RotateImageDialog({
  open,
  onOpenChange,
  imageUrl,
  description,
  onSave,
}: RotateImageDialogProps) {
  // Running clockwise degrees; unbounded so the handle can keep turning.
  const [angle, setAngle] = useState(0);
  // Natural size, once loaded. Save needs the element: the upload form draws it.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stage = useElementSize(stageRef, open && Boolean(imageUrl));
  const turn = (degrees: number) => {
    setError(null);
    setAngle(degrees);
  };
  const stageDrag = useDragRotation({ angle, onChange: turn, pivotRef: stageRef, disabled: busy || !natural });
  const saved = normalizeAngle(angle);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setAngle(0);
      setNatural(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    const img = imgRef.current;
    if (!img || !natural || saved === 0) return;
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(saved, img);
      if (message) {
        setError(message);
        return;
      }
      setAngle(0);
      setNatural(null);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  // Fit the image's diagonal inside the stage, so no angle takes it out of view.
  let displaySize: { width: number; height: number } | undefined;
  if (natural && stage.width && stage.height) {
    const scale = Math.min(1, Math.min(stage.width, stage.height) / Math.hypot(natural.width, natural.height));
    displaySize = { width: natural.width * scale, height: natural.height * scale };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rotate image</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {imageUrl ? (
          <>
            <RotateControls angle={angle} onChange={turn} pivotRef={stageRef} disabled={busy || !natural} />
            <div
              ref={stageRef}
              className="flex h-[50vh] cursor-grab touch-none select-none items-center justify-center overflow-hidden rounded-md bg-muted/40 active:cursor-grabbing"
              {...stageDrag}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Image to rotate"
                draggable={false}
                className={displaySize ? "max-w-none bg-white" : "max-h-[35vh] max-w-[35vh] bg-white object-contain"}
                style={{ ...displaySize, transform: `rotate(${angle}deg)` }}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onError={() => setError("The image could not be loaded.")}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Drag the image or the handle round to turn it. It snaps to upright and to quarter turns; hold Alt to turn
              freely.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Image unavailable.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !natural || saved === 0} onClick={() => void handleSave()}>
            {busy ? "Saving..." : "Save rotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RotateImageDialog;
