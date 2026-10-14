import { useCallback, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Smallest crop worth saving, in source pixels. Below this it is a misclick. */
export const MIN_CROP_PX = 8;

/** A crop rectangle in the image's natural (source) pixels. */
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
   * Save the selection. `image` is the loaded element the selection was drawn
   * on. Resolve to an error message to keep the dialog open, or null to close.
   */
  onSave: (rect: CropRect, image: HTMLImageElement) => Promise<string | null>;
}

/**
 * The selection half of every crop: drag a box over the image, then hand the
 * box to `onSave` in natural pixels.
 *
 * react-image-crop reports the selection in *displayed* pixels. The image is
 * scaled down to fit the dialog, so the selection is converted back to natural
 * pixels before it is saved -- the backend validates against the real bounds,
 * and a canvas crop draws in source pixels.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const reset = useCallback(() => {
    setCrop(undefined);
    setPixelCrop(null);
    setError(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSave = async () => {
    const img = imgRef.current;
    if (!pixelCrop || !img) return;
    // displayed px -> natural px
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const rect = {
      x: pixelCrop.x * scaleX,
      y: pixelCrop.y * scaleY,
      width: pixelCrop.width * scaleX,
      height: pixelCrop.height * scaleY,
    };
    if (rect.width < MIN_CROP_PX || rect.height < MIN_CROP_PX) {
      setError("Drag a larger area to crop.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(rect, img);
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
          <div className="max-h-[60vh] overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(next) => setCrop(next)}
              onComplete={(next) => setPixelCrop(next)}
              minWidth={MIN_CROP_PX}
              minHeight={MIN_CROP_PX}
            >
              {/* crossOrigin is unset: media is served same-origin, and a local
                  file is a blob: URL, so the canvas is never tainted. */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Select the marking to crop"
                className="max-w-full"
              />
            </ReactCrop>
          </div>
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
