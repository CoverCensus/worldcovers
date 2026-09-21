/**
 * Create a cover from a marking's image, in one step -- issues.md 167 /
 * Trello T37.
 *
 * Ian, 2026-09-15: "all is needed is the date and then it creates the cover,
 * moves the cover image and clears it from Marking Thumbails."
 *
 * Before this, getting a cover photograph off a marking took five steps across
 * two screens: create the cover somewhere else, find its numeric id, come back,
 * link it by typing that id, and only then move the image -- because the "Move
 * to cover" picker lists only covers ALREADY linked to the marking. With none
 * linked, the editor reached a dead end mid-task with nothing telling them what
 * to do instead. A Delaware editor hit exactly that and ended up with his
 * marking and his cover on two unconnected records.
 *
 * ## Why the order is what it is
 *
 * Five API calls, no transaction across them, so the order IS the safety
 * property. Three constraints in the backend fix it:
 *
 * 1. A cover takes its region from its linked markings. `DateSeenViewSet`
 *    rejects a cover with none: "This cover has no linked markings yet, so it
 *    has no region. Link a marking before adding dates." So link before date.
 * 2. `CoverMarkingViewSet.perform_create` writes `review_status=PENDING`
 *    unconditionally, while `loadAssociatedCoversForMarking` renders only
 *    approved rows. Skip the approve and the cover is invisible on the screen
 *    that just created it -- the same dead end, now with two extra rows in the
 *    database. Reese's call, 2026-09-21: the editor approves their own link,
 *    using an endpoint they are already permitted to call.
 * 3. An unlinked cover cannot be cleaned up by an editor. `permissions.py`: "A
 *    cover with no linked markings has no region, so only a superuser can act
 *    on it", and `/covers/` exposes no DELETE at all. So the gap between
 *    creating a cover and linking it must be as short as possible, and
 *    anything that can be checked is checked before the first write.
 *
 * ## Failure policy
 *
 * Nothing created is ever deleted, and the image never moves until every
 * prerequisite has succeeded. Each abort therefore leaves a catalog that is
 * strictly more complete than before and leaves the image exactly where it was,
 * recoverable through a path the editor already has on screen. Rolling back
 * would mean DELETEs that either do not exist or return 403, turning one
 * confusing error into two.
 */
import { validatePartialDate, type PartialDateInput } from "@/lib/partialDate";

export interface CoverFromMarkingImageRequest {
  markingId: number;
  imageId: number;
  /** Cover views are FRONT/BACK/INTERIOR/DETAIL -- a marking view is rejected. */
  imageView: string;
  isBackstamp: boolean;
  date: PartialDateInput;
}

/**
 * Injected rather than imported so the ordering above can be asserted without
 * mocking four modules. Note the absence of any delete: clearing the image from
 * the marking is a subject repoint, never a destroy (issues.md 113 -- the row
 * goes, the file stays, and nothing sweeps it up).
 */
export interface CoverFromMarkingImageServices {
  createCover: () => Promise<{ id: number; code?: string | null }>;
  createCoverMarking: (payload: {
    cover: number;
    marking: number;
    is_backstamp: boolean;
  }) => Promise<{ id: number }>;
  approveCoverMarking: (
    coverMarkingId: number,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  createCoverDate: (payload: {
    cover: number;
    date: string;
    /**
     * Legacy granularities only. createCoverDate sends no date_year/month/day,
     * so nothing finer round-trips -- and "circa" is a separate unresolved
     * decision (issues.md 141 / Trello T42) that is a fourth concept, not a
     * fourth granularity. Typed narrowly so that stays true.
     */
    granularity: "YEAR" | "MONTH" | "DAY";
  }) => Promise<unknown>;
  moveImage: (coverId: number) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export type CoverFromMarkingImageStage = "date" | "cover" | "link" | "approve" | "move";

export type CoverFromMarkingImageResult =
  | { ok: true; coverId: number; coverCode: string | null }
  | {
      ok: false;
      stage: CoverFromMarkingImageStage;
      message: string;
      /** Set once the cover exists, so a message can name it. */
      coverId: number | null;
    };

function messageFrom(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function createCoverFromMarkingImage(
  request: CoverFromMarkingImageRequest,
  services: CoverFromMarkingImageServices,
): Promise<CoverFromMarkingImageResult> {
  // Step 0. Validate before any write. This is the single line that keeps the
  // unrecoverable-orphan window (constraint 3) shut in every case except an
  // outright network failure.
  const parsed = validatePartialDate(request.date);
  // `=== false`, not `!parsed.ok`: tsconfig.app.json sets strict:false, and
  // truthiness narrowing on a discriminated union does not work without
  // strictNullChecks. This is the idiom the rest of the codebase uses.
  if (parsed.ok === false) {
    return { ok: false, stage: "date", message: parsed.error, coverId: null };
  }
  const { legacyDate, legacyGranularity } = parsed.value;
  if (!legacyDate || !legacyGranularity) {
    // "Date unknown" is legal for a cover in general, but a cover reaches a
    // marking's date range only through its date. One created from here
    // without one would contribute nothing and read as an editor error later.
    return {
      ok: false,
      stage: "date",
      message: "Enter at least a year. The date is what this cover contributes to the marking.",
      coverId: null,
    };
  }

  // Step 1. The cover. Every Cover field is nullable and save() assigns the
  // "C-<pk>" code itself, so there is nothing to ask the editor for.
  let coverId: number;
  let coverCode: string | null;
  try {
    const cover = await services.createCover();
    coverId = cover.id;
    coverCode = cover.code ?? null;
  } catch (err) {
    return { ok: false, stage: "cover", message: messageFrom(err, "Could not create the cover."), coverId: null };
  }

  // Step 2. The link, immediately. Gives the cover a region (constraint 1) and
  // closes the orphan window (constraint 3).
  let coverMarkingId: number;
  try {
    const link = await services.createCoverMarking({
      cover: coverId,
      marking: request.markingId,
      is_backstamp: request.isBackstamp,
    });
    coverMarkingId = link.id;
  } catch (err) {
    // Deliberately no cleanup attempt: removeCover 403s for a plain editor and
    // there is no DELETE on /covers/, so trying would replace one error with
    // two. Name the row instead so a human can finish the job.
    return {
      ok: false,
      stage: "link",
      message: `${messageFrom(err, "Could not link the new cover to this marking.")} The cover was created as #${coverId}; an administrator will need to remove or link it.`,
      coverId,
    };
  }

  // Step 3. Approve the link, or the cover stays invisible here (constraint 2).
  const approved = await services.approveCoverMarking(coverMarkingId);
  if (approved.ok === false) {
    return {
      ok: false,
      stage: "approve",
      message: `The cover was created and linked, but its link is still awaiting review (${approved.message}). Approve it, then move the image.`,
      coverId,
    };
  }

  // Step 4. The date. Stops here on failure: the cover and its approved link
  // are reachable from this page, so the date can be added on the cover screen
  // and the image has not moved.
  try {
    await services.createCoverDate({
      cover: coverId,
      date: legacyDate,
      granularity: legacyGranularity,
    });
  } catch (err) {
    return {
      ok: false,
      stage: "date",
      message: `${messageFrom(err, "Could not record the cover's date.")} Cover #${coverId} was created and linked; add the date on the cover screen.`,
      coverId,
    };
  }

  // Step 5. Repoint the image. This is also what "clears it from Marking
  // Thumbnails" -- the marking's gallery stops including it the moment its
  // subject changes. Never a delete.
  const moved = await services.moveImage(coverId);
  if (moved.ok === false) {
    return {
      ok: false,
      stage: "move",
      message: `${moved.message} Cover #${coverId} is complete; use "Move to cover" to finish.`,
      coverId,
    };
  }

  return { ok: true, coverId, coverCode };
}
