/**
 * Carrying a marking's image across to the Create New Cover form.
 *
 * Ian, 2026-09-21: "change the 'move to cover' icon to 'Create cover from this
 * image' then it takes the cover image, opens Create New Cover and puts the
 * image in for the submitter to fill in the form and submit the cover".
 *
 * The marking screen puts a descriptor in router state; `CoverEdit` reads it on
 * arrival, fetches the bytes back into a `File` and drops it into the form's
 * upload list. Router state rather than a query param because the descriptor is
 * four fields and none of them belong in a shareable URL.
 *
 * Parsing lives here, apart from React, because the contract between the two
 * screens is exactly the kind of thing that rots silently when one side is
 * refactored.
 */

export interface SourceMarkingImage {
  /** Catalog id of the image being carried. Persisted so approval can repoint it. */
  imageId: number;
  imageUrl: string;
  originalFilename?: string;
  storageFilename?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Read a source image out of router state, or null when there isn't a usable one.
 *
 * Rejects rather than repairs. A half-formed descriptor means the two screens
 * have drifted, and seeding the form with a broken image would be worse than
 * seeding nothing: the editor would submit a cover with no picture and not know.
 */
export function sourceMarkingImageFromState(state: unknown): SourceMarkingImage | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as Record<string, unknown>).sourceMarkingImage;
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  const imageId = typeof o.imageId === "number" ? o.imageId : Number.NaN;
  const imageUrl = str(o.imageUrl);

  // A negative id is the draft-contribution preview sentinel
  // (lib/contributionImages.ts): those rows are not catalog images and there is
  // nothing on the server to repoint later.
  if (!Number.isFinite(imageId) || imageId <= 0) return null;
  if (!imageUrl) return null;

  return {
    imageId,
    imageUrl,
    originalFilename: str(o.originalFilename) || undefined,
    storageFilename: str(o.storageFilename) || undefined,
  };
}
