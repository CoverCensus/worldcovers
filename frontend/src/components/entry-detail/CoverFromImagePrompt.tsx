import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Offers to turn a whole-cover photograph sitting on a marking into a real
 * Cover record -- issues.md 167 / Trello T37.
 *
 * Ian, 2026-09-15: "We need something on the marking thumbnails section when
 * it identifies a cover being used for the marking image that then asks if
 * they want to add this cover to the cover section."
 *
 * Advisory, never a gate. The classification is a guess from pixel dimensions
 * (lib/imageShape.ts), and legitimate marking aspect ratios reach 8.6 for wide
 * straight-line handstamps. An editor who knows better simply ignores this.
 *
 * Renders nothing when no image qualifies, so the card stays quiet in the
 * normal case -- the same shape as LowResolutionImageWarning.
 */
export function CoverFromImagePrompt({
  count,
  onCreate,
  isOnlyImage = false,
  disabled = false,
}: {
  /** How many of the marking's images look like whole covers. */
  count: number;
  onCreate: () => void;
  /**
   * The flagged image is the marking's only picture. Moving it to a cover on
   * approval would leave this record with nothing -- the situation the crop
   * feature exists to prevent, since the backend promotes the next sibling to
   * display_order 0 and here there is no sibling.
   */
  isOnlyImage?: boolean;
  disabled?: boolean;
}) {
  if (count < 1) return null;

  return (
    <Alert variant="warning" className="mb-3" data-testid="cover-from-image-prompt">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {count === 1
          ? "This image looks like a whole cover"
          : `${count} of these images look like whole covers`}
      </AlertTitle>
      <AlertDescription>
        <p>
          Covers belong in their own record, and a cover's date is what sets this marking's
          earliest and latest dates. You only need the date — the cover is created, linked and the
          image moved across for you.
        </p>
        {isOnlyImage && (
          <p className="mt-2 font-medium">
            This is the marking's only image. Crop the marking out of it first, or this record
            will be left with no picture.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={disabled}
          onClick={onCreate}
        >
          Create a cover from this image
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default CoverFromImagePrompt;
