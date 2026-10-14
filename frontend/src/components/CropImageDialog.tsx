import { CropSelectionDialog } from "@/components/CropSelectionDialog";
import { cropImage, type CropDestination } from "@/services/markings";

interface CropImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: number | null;
  imageUrl: string | null;
  /** Called after a crop is saved, so the caller can refetch the record. */
  onCropped: () => void | Promise<void>;
  /**
   * Send the crop to an associated Marking with no image instead of this
   * record (Trello T37, workspace issues.md #182). `label` names it in the copy.
   */
  destination?: CropDestination & { label: string };
}

/**
 * Lets an editor cut the marking out of a scan of a whole cover (issue #77).
 *
 * The catalog has a lot of whole-cover scans sitting in marking image slots.
 * The full scan belongs on a Cover, but moving it first would leave the marking
 * with no image at all, so the crop has to happen before the move.
 *
 * The server does the crop (`POST /images/{id}/crop/`). For an upload that is
 * not in the catalog yet, see LocalCropImageDialog.
 */
export function CropImageDialog({
  open,
  onOpenChange,
  imageId,
  imageUrl,
  onCropped,
  destination,
}: CropImageDialogProps) {
  return (
    <CropSelectionDialog
      open={open}
      onOpenChange={onOpenChange}
      imageUrl={imageUrl}
      title={destination ? "Crop the marking out of this cover scan" : "Crop the marking out of this image"}
      description={
        destination
          ? `Drag a box around the marking. The crop is added to ${destination.label}, which has no image yet. The cover keeps the original.`
          : "Drag a box around the marking. The cropped area is added as a new image on this record; the original is left untouched."
      }
      saveLabel="Save crop"
      onSave={async (rect) => {
        if (!imageId) return "Image unavailable.";
        const result = await cropImage(imageId, rect, destination);
        if (result.ok === false) return result.message;
        await onCropped();
        return null;
      }}
    />
  );
}

export default CropImageDialog;
