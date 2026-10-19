import { useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RotateImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  description: string;
  /**
   * Save the turn, clockwise. `image` is the loaded preview element. Resolve
   * to an error message to keep the dialog open, or null to close.
   */
  onSave: (quarterTurns: 1 | 2 | 3, image: HTMLImageElement) => Promise<string | null>;
}

/**
 * Turn an image in quarter turns, previewed before one save (Trello T66).
 *
 * Shared by the catalog Marking page (saved on the server) and the upload form
 * (turned in the browser). The preview is a CSS transform only; nothing is
 * written until Save, so several clicks cost one write.
 */
export function RotateImageDialog({
  open,
  onOpenChange,
  imageUrl,
  description,
  onSave,
}: RotateImageDialogProps) {
  // Net clockwise quarter turns, 0-3.
  const [turns, setTurns] = useState(0);
  // Save needs the loaded element: the upload form draws it onto a canvas.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setTurns(0);
      setLoaded(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const turn = (by: 1 | 3) => {
    setError(null);
    setTurns((current) => (current + by) % 4);
  };

  const handleSave = async () => {
    const img = imgRef.current;
    if (!img || !loaded || turns === 0) return;
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(turns as 1 | 2 | 3, img);
      if (message) {
        setError(message);
        return;
      }
      setTurns(0);
      setLoaded(false);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rotate image</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {imageUrl ? (
          // A square stage, so a quarter turn never overflows it.
          <div className="flex h-[50vh] items-center justify-center overflow-hidden">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Image to rotate"
              className="max-h-[50vh] max-w-[50vh] object-contain transition-transform"
              style={{ transform: `rotate(${turns * 90}deg)` }}
              onLoad={() => setLoaded(true)}
              onError={() => setError("The image could not be loaded.")}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Image unavailable.</p>
        )}

        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" disabled={busy || !imageUrl} onClick={() => turn(3)}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Rotate left
          </Button>
          <Button type="button" variant="outline" disabled={busy || !imageUrl} onClick={() => turn(1)}>
            <RotateCw className="mr-1 h-4 w-4" />
            Rotate right
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !loaded || turns === 0} onClick={() => void handleSave()}>
            {busy ? "Saving..." : "Save rotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RotateImageDialog;
