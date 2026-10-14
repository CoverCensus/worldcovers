import { useEffect, useState } from "react";

import { CropSelectionDialog } from "@/components/CropSelectionDialog";
import { cropImageFile } from "@/lib/cropImageFile";

interface LocalCropImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The upload to crop. Not in the catalog yet, so the crop happens here. */
  file: File | null;
  /** Receives the cropped file, which replaces the upload. */
  onCropped: (file: File) => void;
}

/**
 * Crop an upload before it is submitted (Ian, 2026-10-14: "folks usually have
 * the whole cover"). Unlike CropImageDialog this writes nothing to the server:
 * the cropped File replaces the upload in the form, so the reviewer sees
 * exactly the image that would be published. The original is not kept.
 */
export function LocalCropImageDialog({ open, onOpenChange, file, onCropped }: LocalCropImageDialogProps) {
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
    <CropSelectionDialog
      open={open}
      onOpenChange={onOpenChange}
      imageUrl={url}
      title="Crop the marking out of this image"
      description="Drag a box around the marking. The cropped area replaces this upload; the uncropped image is not submitted."
      saveLabel="Use crop"
      onSave={async (rect, image) => {
        if (!file) return "Image unavailable.";
        try {
          onCropped(await cropImageFile(image, rect, file));
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : "Could not crop this image.";
        }
      }}
    />
  );
}

export default LocalCropImageDialog;
