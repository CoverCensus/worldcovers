/**
 * Carrying a marking's image across to the Create New Cover form.
 *
 * Ian, 2026-09-21: "change the 'move to cover' icon to 'Create cover from this
 * image' then it takes the cover image, opens Create New Cover and puts the
 * image in for the submitter to fill in the form and submit the cover".
 *
 * The image is never re-uploaded. The marking screen puts a descriptor in
 * router state; `CoverEdit` shows it as an ordinary gallery tile and sends only
 * `source_marking_image_id`, and approval repoints the one catalog Image row.
 * Router state rather than a query param because the descriptor is four fields
 * and none of them belong in a shareable URL.
 *
 * Router state is gone once the draft is saved and reopened from the Dashboard,
 * so the contribution detail endpoint returns the same descriptor as
 * `source_marking_image` (Trello T37). Both arrive here, in one parser, so the
 * resumed form and the review gallery see exactly what the first visit saw.
 *
 * Parsing lives here, apart from React, because the contract between the
 * screens is exactly the kind of thing that rots silently when one side is
 * refactored.
 */
import type { MarkingImage } from "@/services/markings";

/** Caption for the carried-over tile on the form and in the review gallery. */
export const CARRIED_OVER_LABEL = "Carried over from the marking";

export interface SourceMarkingImage {
  /** Catalog id of the image being carried. Persisted so approval can repoint it. */
  imageId: number;
  imageUrl: string;
  originalFilename?: string;
  storageFilename?: string;
  /**
   * Where the contributor left the tile in the gallery, 0-based, as the server
   * recorded it at the last save (workspace issues.md #181). Undefined on a
   * first visit from the marking screen and for drafts saved before the field
   * existed; both mean "first".
   */
  position?: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}

function positionOrUndefined(v: unknown): number | undefined {
  const n = num(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Read a source image descriptor, or null when there isn't a usable one.
 *
 * Accepts the marking screen's camelCase shape and the server's snake_case
 * shape. Rejects rather than repairs. A half-formed descriptor means two sides
 * have drifted, and seeding the form with a broken image would be worse than
 * seeding nothing: the editor would submit a cover with no picture and not know.
 */
export function sourceMarkingImageFromDescriptor(raw: unknown): SourceMarkingImage | null {
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  const imageId = num(o.imageId ?? o.id);
  const imageUrl = str(o.imageUrl ?? o.image_url);

  // A negative id is the draft-contribution preview sentinel
  // (lib/contributionImages.ts): those rows are not catalog images and there is
  // nothing on the server to repoint later.
  if (!Number.isFinite(imageId) || imageId <= 0) return null;
  if (!imageUrl) return null;

  return {
    imageId,
    imageUrl,
    originalFilename: str(o.originalFilename ?? o.original_filename) || undefined,
    storageFilename: str(o.storageFilename ?? o.storage_filename) || undefined,
    position: positionOrUndefined(o.position),
  };
}

/**
 * Put the carried tile back where the contributor left it. Undefined means
 * first, which is also the default slot on a first visit; a position past the
 * end appends. Approval applies the same rule (`_repoint_source_marking_image`),
 * so the form, the review page and the catalog agree.
 */
export function insertCarriedTile<T>(items: readonly T[], carried: T, position: number | undefined): T[] {
  const slot = position == null ? 0 : Math.min(Math.max(0, Math.trunc(position)), items.length);
  return [...items.slice(0, slot), carried, ...items.slice(slot)];
}

/** The descriptor the marking screen sends through router state, or null. */
export function sourceMarkingImageFromState(state: unknown): SourceMarkingImage | null {
  if (!state || typeof state !== "object") return null;
  return sourceMarkingImageFromDescriptor((state as Record<string, unknown>).sourceMarkingImage);
}

/**
 * The descriptor the contribution detail endpoint resolved for a saved
 * submission, or null when it carries nothing (or the image has since moved
 * off the marking and will not transfer on approval).
 */
export function sourceMarkingImageFromContribution(item: {
  source_marking_image?: unknown;
  sourceMarkingImage?: unknown;
}): SourceMarkingImage | null {
  return sourceMarkingImageFromDescriptor(item.source_marking_image ?? item.sourceMarkingImage);
}

/**
 * The gallery row for a carried-over image. It keeps its real catalog id and
 * MARKING subject, which is how the form tells it apart from uploaded previews
 * (negative ids) and from a published cover's own images (COVER subject).
 */
export function markingImageFromSourceMarkingImage(
  source: SourceMarkingImage,
  markingId: number,
): MarkingImage {
  return {
    imageId: source.imageId,
    subjectType: "MARKING",
    subjectId: markingId,
    imageUrl: source.imageUrl,
    imageView: "FRONT",
    originalFilename: source.originalFilename ?? "",
    storageFilename: source.storageFilename ?? "",
    imageDescription: "",
    isTracing: false,
    displayOrder: 0,
    imageWidth: 0,
    imageHeight: 0,
  };
}
