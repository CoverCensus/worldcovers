/**
 * Whether a marking's per-image controls (crop, move, delete, reorder) should
 * render, and if they render disabled, why -- issues.md 166.
 *
 * The marking detail screen previously collapsed three unrelated conditions
 * into one boolean:
 *
 *   const canManageImage = isStaff && !record.isRemoved && img.imageId != null;
 *
 * and then rendered the whole action cluster behind it. Three different causes
 * produced one identical outcome: nothing on screen, with nothing explaining
 * it. Only one of the three has any other visible signal -- a removed marking
 * shows a recycle-bin banner, and a signed-out visitor never expected editor
 * tools in the first place. An unsaved image says nothing at all, which is how
 * an editor spent two days hunting a crop button that was working correctly.
 *
 * Splitting permission (may this person act at all?) from state (can this
 * particular image be acted on right now?) is what lets the caller render the
 * controls disabled-with-a-reason instead of absent.
 */

export interface ImageActionStateInput {
  /**
   * The image's catalog id, or null when it has none. Null covers two cases the
   * gallery cannot tell apart: an image the editor has selected but not yet
   * saved, and a draft-contribution preview row (carried as a negative sentinel
   * and normalised to null by `buildGalleryImages`). Neither can be cropped or
   * moved, and "not saved to the catalog yet" is true of both.
   */
  imageId: number | null;
  /** Editor, administrator or superuser. Mirrors the backend's IsEditorOrAdminWrite. */
  isStaff: boolean;
  /** The marking is in the recycle bin. */
  isRemoved: boolean;
}

export interface ImageActionState {
  /**
   * Render the action cluster at all. False for non-staff, who must not see
   * greyed-out editor tools -- a disabled control still advertises a capability.
   */
  showControls: boolean;
  /** The image exists in the catalog, so crop and move have something to act on. */
  isSaved: boolean;
  /**
   * Why the controls are disabled, or null when they are usable. Callers must
   * render this as visible text, not only as a `title` tooltip: a tooltip on a
   * disabled button is unreliable to reach and invisible to anyone not
   * hovering, which is the exact failure mode this issue is about.
   */
  disabledReason: string | null;
}

/** A removed marking is read-only for everyone; only Restore survives. */
const REMOVED_REASON =
  "This marking is in the recycle bin. Restore it before editing its images.";

/** The case that cost a Delaware editor two days. */
const UNSAVED_REASON =
  "This image has not been saved to the catalog yet, so it cannot be cropped or moved.";

export function imageActionState({
  imageId,
  isStaff,
  isRemoved,
}: ImageActionStateInput): ImageActionState {
  const isSaved = imageId != null;

  if (!isStaff) {
    return { showControls: false, isSaved, disabledReason: null };
  }

  // Ordered by which reason the editor can act on. Restoring the marking is a
  // concrete next step; if it is also unsaved, that becomes relevant only once
  // the record is live again.
  const disabledReason = isRemoved
    ? REMOVED_REASON
    : !isSaved
      ? UNSAVED_REASON
      : null;

  return { showControls: true, isSaved, disabledReason };
}
