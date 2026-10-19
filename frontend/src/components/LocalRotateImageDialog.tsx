import { useEffect, useState } from "react";

import { RotateImageDialog } from "@/components/RotateImageDialog";
import { rotateImageFile } from "@/lib/rotateImageFile";

interface LocalRotateImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The upload to turn. Not in the catalog yet, so the turn happens here. */
  file: File | null;
  /** Receives the turned file, which replaces the upload. */
  onRotated: (file: File) => void;
}

/**
 * Turn an upload before it is submitted (Trello T66; Ian, 2026-10-16). Like
 * LocalCropImageDialog this writes nothing to the server: the turned File
 * replaces the upload in the form, so the reviewer sees the image that would
 * be published.
 */
export function LocalRotateImageDialog({ open, onOpenChange, file, onRotated }: LocalRotateImageDialogProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [open, file]);

  return (
    <RotateImageDialog
      open={open}
      onOpenChange={onOpenChange}
      imageUrl={url}
      description="Turn the image until the marking reads upright. The turned image replaces this upload."
      onSave={async (quarterTurns, image) => {
        if (!file) return "Image unavailable.";
        try {
          onRotated(await rotateImageFile(image, quarterTurns, file));
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : "Could not rotate this image.";
        }
      }}
    />
  );
}

export default LocalRotateImageDialog;
