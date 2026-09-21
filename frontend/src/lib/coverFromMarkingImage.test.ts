/**
 * issues.md 167 / Trello T37 -- create a cover from a marking image.
 *
 * Ian, 2026-09-15: "all is needed is the date and then it creates the cover,
 * moves the cover image and clears it from Marking Thumbails."
 *
 * That is five API calls with no transaction spanning them, so the ORDER is the
 * safety property and these tests are what pin it. Three constraints force it:
 *
 * 1. A cover derives its region from its linked markings. POST /dates-seen/
 *    rejects a cover with no link outright -- "This cover has no linked
 *    markings yet, so it has no region" (views.py). The link must precede the
 *    date.
 * 2. CoverMarkingViewSet.perform_create writes review_status=PENDING
 *    unconditionally, and loadAssociatedCoversForMarking shows only approved
 *    rows. Without an explicit approve the new cover is invisible on the very
 *    screen that created it, and the editor is back at the dead end they
 *    started from. Reese's call, 2026-09-21: the editor approves their own
 *    link.
 * 3. An unlinked cover is unrecoverable by an editor -- permissions.py: "A
 *    cover with no linked markings has no region, so only a superuser can act
 *    on it." /covers/ exposes no DELETE either. So the window between creating
 *    a cover and linking it must be as small as possible, and the date is
 *    validated before any write at all.
 *
 * The resulting policy, in one sentence: nothing created is ever deleted, and
 * the image never moves until every prerequisite has succeeded. Every abort
 * leaves a strictly more complete catalog and leaves the image where it was.
 */
import { createCoverFromMarkingImage } from "./coverFromMarkingImage";

const okDate = { unknown: false, year: "1847", month: "8", day: "3" };

function services(over: Record<string, unknown> = {}) {
  return {
    createCover: jest.fn().mockResolvedValue({ id: 42, code: "C-42" }),
    createCoverMarking: jest.fn().mockResolvedValue({ id: 900 }),
    approveCoverMarking: jest.fn().mockResolvedValue({ ok: true }),
    createCoverDate: jest.fn().mockResolvedValue({ id: 1 }),
    moveImage: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

const run = (svc: ReturnType<typeof services>) =>
  createCoverFromMarkingImage(
    { markingId: 31110, imageId: 5869, imageView: "FRONT", isBackstamp: false, date: okDate },
    svc as never,
  );

describe("createCoverFromMarkingImage", () => {
  it("links the marking before writing the date, and moves the image last", async () => {
    const svc = services();

    const result = await run(svc);

    expect(result.ok).toBe(true);
    const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
    expect(order(svc.createCover)).toBeLessThan(order(svc.createCoverMarking));
    // Constraint 1: a cover with no link has no region and the date POST 403s.
    expect(order(svc.createCoverMarking)).toBeLessThan(order(svc.createCoverDate));
    // Constraint 2: without the approve the cover never appears on this screen.
    expect(order(svc.createCoverMarking)).toBeLessThan(order(svc.approveCoverMarking));
    // The move is last, so any earlier failure leaves the image where it was.
    expect(order(svc.createCoverDate)).toBeLessThan(order(svc.moveImage));
  });

  it("clears the image from the marking by repointing it, never by deleting it", async () => {
    const svc = services();

    await run(svc);

    // ImageViewSet.perform_destroy drops the DB row and leaves the file on
    // disk, and no reaper exists (issues.md 113). The subject repoint removes
    // it from the marking's gallery for free and orphans nothing.
    expect(svc.moveImage).toHaveBeenCalledWith(42);
    expect(Object.keys(svc)).not.toContain("deleteImage");
  });

  it("writes nothing at all when the date is not usable", async () => {
    const svc = services();

    const result = await createCoverFromMarkingImage(
      {
        markingId: 31110,
        imageId: 5869,
        imageView: "FRONT",
        isBackstamp: false,
        // A day with no month cannot be expressed; inventing one would be a
        // fabricated observation.
        date: { unknown: false, year: "1847", month: "", day: "3" },
      },
      svc as never,
    );

    expect(result.ok).toBe(false);
    // Validating first is what keeps the unrecoverable-orphan window shut.
    expect(svc.createCover).not.toHaveBeenCalled();
  });

  it("refuses a cover with no date rather than creating a dateless one", async () => {
    const svc = services();

    const result = await createCoverFromMarkingImage(
      {
        markingId: 31110,
        imageId: 5869,
        imageView: "FRONT",
        isBackstamp: false,
        date: { unknown: true, year: "", month: "", day: "" },
      },
      svc as never,
    );

    // A cover contributes to a marking's date range only through its date.
    expect(result.ok).toBe(false);
    expect(svc.createCover).not.toHaveBeenCalled();
  });

  it("names the cover when the link fails, because an editor cannot remove it", async () => {
    const svc = services({
      createCoverMarking: jest.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await run(svc);

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("unreachable");
    expect(result.stage).toBe("link");
    // permissions.py: only a superuser can act on an unlinked cover, and there
    // is no DELETE on /covers/. The id has to reach a human.
    expect(result.message).toContain("42");
    expect(svc.moveImage).not.toHaveBeenCalled();
  });

  it("leaves the image on the marking when the date cannot be written", async () => {
    const svc = services({
      createCoverDate: jest.fn().mockRejectedValue(new Error("nope")),
    });

    const result = await run(svc);

    expect(result.ok).toBe(false);
    // Cover and approved link both exist and are reachable from the page, so
    // the editor adds the date on the cover screen. Nothing is lost.
    expect(svc.moveImage).not.toHaveBeenCalled();
  });

  it("stops before the move when the link cannot be approved", async () => {
    const svc = services({
      approveCoverMarking: jest.fn().mockResolvedValue({ ok: false, message: "not yours" }),
    });

    const result = await run(svc);

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("unreachable");
    expect(result.stage).toBe("approve");
    // Cover and link are valid, just pending -- they surface in the review
    // queue. Moving the image now would hide it behind an unapproved link.
    expect(svc.createCoverDate).not.toHaveBeenCalled();
    expect(svc.moveImage).not.toHaveBeenCalled();
  });

  it("reports a failed move without undoing the cover that now exists", async () => {
    const svc = services({
      moveImage: jest.fn().mockResolvedValue({ ok: false, message: "server said no" }),
    });

    const result = await run(svc);

    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("unreachable");
    expect(result.stage).toBe("move");
    expect(result.coverId).toBe(42);
  });

  it("sends only a legacy day, month or year granularity", async () => {
    const svc = services();

    await run(svc);

    expect(svc.createCoverDate).toHaveBeenCalledWith(
      expect.objectContaining({ cover: 42, date: "1847-08-03", granularity: "DAY" }),
    );
  });
});
