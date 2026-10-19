import { useCallback, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

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
import { useElementSize } from "@/hooks/useElementSize";
import { normalizeAngle, rotatedSize } from "@/lib/imageRotation";

/** Smallest crop worth saving, in source pixels. Below this it is a misclick. */
export const MIN_CROP_PX = 8;

/** A crop rectangle in the image's natural (source) pixels, after any turn. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  title: string;
  description: string;
  saveLabel: string;
  /**
   * Save the selection. `image` is the loaded (unturned) source element and
   * `angle` the clockwise turn in (-180, 180] the rect was drawn on; the rect
   * is in the turned image's pixels. Resolve to an error message to keep the
   * dialog open, or null to close.
   */
  onSave: (rect: CropRect, image: HTMLImageElement, angle: number) => Promise<string | null>;
}

/**
 * The selection half of every crop: drag a box over the image, then hand the
 * box to `onSave` in natural pixels.
 *
 * react-image-crop reports the selection in *displayed* pixels. The image is
 * scaled down to fit the dialog, so the selection is converted back to natural
 * pixels before it is saved -- the backend validates against the real bounds,
 * and a canvas crop draws in source pixels.
 *
 * Workspace issue #193 adds a rotate handle so a tilted strike can be
 * straightened before it is cut out. The selection is drawn over a box the
 * size of the whole turned image (Pillow's expand size, `rotatedSize`) holding
 * the CSS-rotated source, so the box and the server's turned image share
 * pixels. Turning clears the selection. The source is never changed.
 */
export function CropSelectionDialog({
  open,
  onOpenChange,
  imageUrl,
  title,
  description,
  saveLabel,
  onSave,
}: CropSelectionDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  // Running clockwise degrees; unbounded so the handle can keep turning.
  const [angle, setAngle] = useState(0);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stage = useElementSize(stageRef, open && Boolean(imageUrl));

  const reset = useCallback(() => {
    setCrop(undefined);
    setPixelCrop(null);
    setAngle(0);
    setNatural(null);
    setError(null);
  }, []);

  const turn = (degrees: number) => {
    // A box drawn on the old angle covers different pixels now.
    setCrop(undefined);
    setPixelCrop(null);
    setError(null);
    setAngle(degrees);
  };

  // The whole turned image, scaled to the stage width (never enlarged).
  const turned = natural ? rotatedSize(natural.width, natural.height, angle) : null;
  const scale = turned && stage.width ? Math.min(1, stage.width / turned.width) : 1;

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSave = async () => {
    const img = imgRef.current;
    if (!pixelCrop || !img || !natural) return;
    // displayed px -> natural px of the turned image
    const rect = {
      x: pixelCrop.x / scale,
      y: pixelCrop.y / scale,
      width: pixelCrop.width / scale,
      height: pixelCrop.height / scale,
    };
    if (rect.width < MIN_CROP_PX || rect.height < MIN_CROP_PX) {
      setError("Drag a larger area to crop.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(rect, img, normalizeAngle(angle));
      if (message) {
        setError(message);
        return;
      }
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {imageUrl ? (
          <>
            <RotateControls angle={angle} onChange={turn} pivotRef={boxRef} disabled={busy || !natural} />
            <div ref={stageRef} className="max-h-[60vh] overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(next) => setCrop(next)}
                onComplete={(next) => setPixelCrop(next)}
                minWidth={MIN_CROP_PX}
                minHeight={MIN_CROP_PX}
              >
                <div
                  ref={boxRef}
                  className="relative overflow-hidden bg-white"
                  style={turned ? { width: turned.width * scale, height: turned.height * scale } : undefined}
                >
                  {/* crossOrigin is unset: media is served same-origin, and a local
                      file is a blob: URL, so the canvas is never tainted. */}
                  <img
                    ref={imgRef}
                    src={imageUrl}
                    alt="Select the marking to crop"
                    draggable={false}
                    className={natural ? "absolute left-1/2 top-1/2 max-w-none" : "max-w-full"}
                    style={
                      natural
                        ? {
                            width: natural.width * scale,
                            height: natural.height * scale,
                            // The saved angle, so the box sits on the pixels the server cuts.
                            transform: `translate(-50%, -50%) rotate(${normalizeAngle(angle)}deg)`,
                          }
                        : undefined
                    }
                    onLoad={(event) =>
                      setNatural({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      })
                    }
                  />
                </div>
              </ReactCrop>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Drag the round handle to straighten the image first if the marking is tilted, then drag a box around it.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Image unavailable.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !pixelCrop || !pixelCrop.width || !pixelCrop.height}
            onClick={() => void handleSave()}
          >
            {busy ? "Saving..." : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CropSelectionDialog;
