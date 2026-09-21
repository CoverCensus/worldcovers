/**
 * Which of a marking's stored images look like whole covers -- issues.md 167 /
 * Trello T37.
 *
 * Deliberately a thin pass through `looksLikeWrongKind` from lib/imageShape.
 * That classifier already carries thresholds measured off both live sites on
 * 2026-08-05 and validated at ~91% recall against the only labelled set there
 * is. Re-deriving any of it here would create a second heuristic that drifts
 * from the one the upload forms warn with, and editors would get two different
 * answers about the same picture.
 *
 * The only new thing is the input. The upload path measures a File in the
 * browser; an image already in the catalog has no File, so the dimensions come
 * from the API instead. Everything downstream is identical.
 */
import { looksLikeWrongKind } from "@/lib/imageShape";
import type { MarkingImage } from "@/services/markings";

/**
 * Marking-subject images whose shape reads as a whole cover.
 *
 * A zero dimension -- a legacy row that recorded none -- classifies as
 * indeterminate and is not returned. No prompt on unknown data.
 */
export function coverLikeMarkingImages(images: MarkingImage[]): MarkingImage[] {
  return images.filter(
    (img) =>
      img.subjectType === "MARKING" &&
      looksLikeWrongKind({ width: img.imageWidth, height: img.imageHeight }, "MARKING"),
  );
}

/**
 * True when `imageId` is the only MARKING-subject image on the record.
 *
 * Moving it to a cover would leave the marking with no picture at all. The
 * backend promotes the next sibling to display_order 0 after a move, but there
 * is no sibling to promote -- which is the situation the crop feature exists to
 * prevent. The caller warns rather than blocks: an editor may genuinely be
 * fixing a record that should never have carried that scan.
 *
 * COVER-subject rows in the same list belong to associated covers, not to the
 * marking, so they cannot stand in as the picture it keeps.
 */
export function isLastMarkingImage(images: MarkingImage[], imageId: number): boolean {
  const markingImages = images.filter((img) => img.subjectType === "MARKING");
  return markingImages.length === 1 && markingImages[0].imageId === imageId;
}
