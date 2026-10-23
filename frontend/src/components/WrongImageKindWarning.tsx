import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  COVER_FORM_MARKING_IMAGE_WARNING,
  MARKING_EDIT_FORM_COVER_IMAGE_WARNING,
  MARKING_FORM_COVER_IMAGE_WARNING,
} from "@/labels/guidelines";

interface WrongImageKindWarningProps {
  /** What this form collects. Decides which way the warning reads. */
  expected: "MARKING" | "COVER";
  /** How many selected images look like the other kind. */
  count: number;
  /** Optional fix offered under the notice, e.g. "Crop to the marking". */
  action?: React.ReactNode;
  /**
   * The form edits a published Marking (Trello T92): there is no Cover section
   * to point at, so the marking-form copy offers a Cover draft instead.
   */
  editing?: boolean;
}

/**
 * Advisory shown when uploaded images look like the wrong kind for this form
 * (issue #76).
 *
 * ~98% of the mis-slotted images in the catalog came from the v1 import rather
 * than from contributors, so this is not the main repair -- it stops the small
 * live trickle while that backfill happens (#78).
 *
 * The classification is a guess from pixel dimensions, so both notices are
 * advisory. Rendering nothing when count is 0 keeps the form quiet in the
 * normal case.
 */
export function WrongImageKindWarning({
  expected,
  count,
  action,
  editing = false,
}: WrongImageKindWarningProps) {
  if (count < 1) return null;

  const copy =
    expected === "MARKING"
      ? editing
        ? MARKING_EDIT_FORM_COVER_IMAGE_WARNING
        : MARKING_FORM_COVER_IMAGE_WARNING
      : COVER_FORM_MARKING_IMAGE_WARNING;
  return (
    <Alert variant="warning" className="mt-3" data-testid="wrong-image-kind-warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.body}</p>
        {count > 1 && (
          <p className="mt-1 text-xs opacity-80">
            {count} of the images you selected look this way.
          </p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </AlertDescription>
    </Alert>
  );
}

export default WrongImageKindWarning;
