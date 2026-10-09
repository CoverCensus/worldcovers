/**
 * Why a cover's per-image controls render disabled -- the cover-screen half of
 * issues.md 166 (workspace register #180, Trello T37).
 *
 * The marking screen already splits "may this person act?" from "can this
 * image be acted on right now?" (`imageActionState.ts`) and renders the second
 * answer as visible text. The cover screen did not: it passed no `onMoveImage`
 * at all when the cover had no associated Marking, and hid move and delete for
 * an unsaved image, so three different causes again produced one identical
 * outcome -- nothing on screen, nothing explaining it.
 *
 * Permission stays with the caller (`canManageImages`); this module only names
 * the state reasons. Roles are unchanged (T20 owns Contributor changes), and
 * "Move to another marking" stays removed (ISSUE.md T33/T35).
 */

/** Mirrors the marking-side wording; delete is included because the cover card gates it too. */
export const UNSAVED_IMAGE_REASON =
  "This image has not been saved to the catalog yet, so it cannot be moved or deleted.";

export const NO_ASSOCIATED_MARKING_REASON =
  "This cover has no associated Marking to move the image to. Link an existing Marking first.";

export const MARKINGS_LOAD_ERROR_REASON =
  "Associated Markings could not be loaded, so the image cannot be moved yet. Reload the page to retry.";

export const NO_ASSOCIATED_MARKING_FOR_CROP_REASON =
  "This cover has no associated Marking to crop into. Link an existing Marking first.";

export const EVERY_MARKING_HAS_AN_IMAGE_REASON =
  "Every associated Marking already has an image, so there is nothing to crop into.";

export const MARKINGS_LOAD_ERROR_FOR_CROP_REASON =
  "Associated Markings could not be loaded, so nothing can be cropped into yet. Reload the page to retry.";

export interface MoveToMarkingInput {
  /** Markings currently linked to this cover (any review status). */
  associatedMarkingCount: number;
  /** The page's association-load error, or null when the load succeeded. */
  loadError: string | null;
}

/**
 * Why "Move to marking" is disabled, or null when it is usable. A load failure
 * wins over an empty list: an empty list after a failed load says nothing about
 * the cover, and "link a Marking first" would send the editor to do work that
 * may already be done.
 */
export function moveToMarkingDisabledReason({
  associatedMarkingCount,
  loadError,
}: MoveToMarkingInput): string | null {
  if (loadError != null) return MARKINGS_LOAD_ERROR_REASON;
  if (associatedMarkingCount === 0) return NO_ASSOCIATED_MARKING_REASON;
  return null;
}

/** The shape the cover page already holds for each associated Marking. */
export interface AssociatedMarkingLike {
  link: { reviewStatus: string };
  marking: { id: number; images: readonly unknown[] };
}

/**
 * The Markings a crop from this cover may land on (Trello T37, workspace
 * issues.md #182): approved associations that currently hold no image. The
 * server enforces the same rule; this only decides what to offer.
 */
export function imagelessAssociatedMarkings<T extends AssociatedMarkingLike>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.link.reviewStatus === "approved" && row.marking.images.length === 0);
}

export interface CropIntoMarkingInput {
  associatedMarkingCount: number;
  eligibleCount: number;
  loadError: string | null;
}

/** Why "Crop into marking" is disabled, or null when at least one Marking qualifies. */
export function cropIntoMarkingDisabledReason({
  associatedMarkingCount,
  eligibleCount,
  loadError,
}: CropIntoMarkingInput): string | null {
  if (loadError != null) return MARKINGS_LOAD_ERROR_FOR_CROP_REASON;
  if (associatedMarkingCount === 0) return NO_ASSOCIATED_MARKING_FOR_CROP_REASON;
  if (eligibleCount === 0) return EVERY_MARKING_HAS_AN_IMAGE_REASON;
  return null;
}
