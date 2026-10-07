/**
 * Workspace issues.md #180 / Trello T37 -- the cover screen hid "Move to
 * marking" when the cover had no associated Marking, the same defect the
 * marking screen fixed under issues.md 166: a hidden control reads as a
 * missing feature.
 */
import {
  cropIntoMarkingDisabledReason,
  imagelessAssociatedMarkings,
  moveToMarkingDisabledReason,
} from "./coverImageActionState";

describe("moveToMarkingDisabledReason", () => {
  it("tells the editor to link a Marking when the cover has none", () => {
    const reason = moveToMarkingDisabledReason({ associatedMarkingCount: 0, loadError: null });
    expect(reason).toMatch(/link an existing marking/i);
  });

  it("puts a failed association load ahead of an empty list", () => {
    // An empty list after a failed load says nothing about the cover.
    const reason = moveToMarkingDisabledReason({ associatedMarkingCount: 0, loadError: "read failed" });
    expect(reason).toMatch(/could not be loaded/i);
    expect(reason).not.toMatch(/link an existing marking/i);
  });

  it("is usable once at least one Marking is linked", () => {
    expect(moveToMarkingDisabledReason({ associatedMarkingCount: 1, loadError: null })).toBeNull();
  });
});

// Trello T37 / workspace issues.md #182: crop from a cover into an associated
// Marking that has no image. Offered only when one qualifies; otherwise the
// control stays, disabled, with the reason as text.
describe("crop into marking", () => {
  const row = (reviewStatus: string, images: unknown[]) => ({ link: { reviewStatus }, marking: { id: 1, images } });

  it("offers only approved associations that have no image", () => {
    const rows = [row("approved", []), row("approved", [{}]), row("pending", [])];
    expect(imagelessAssociatedMarkings(rows)).toEqual([rows[0]]);
  });

  it("explains an empty offer: no Markings, or every Marking already has an image", () => {
    expect(cropIntoMarkingDisabledReason({ associatedMarkingCount: 0, eligibleCount: 0, loadError: null })).toMatch(/link an existing marking/i);
    expect(cropIntoMarkingDisabledReason({ associatedMarkingCount: 2, eligibleCount: 0, loadError: null })).toMatch(/already has an image/i);
    expect(cropIntoMarkingDisabledReason({ associatedMarkingCount: 2, eligibleCount: 0, loadError: "boom" })).toMatch(/could not be loaded/i);
  });

  it("is usable once a Marking qualifies", () => {
    expect(cropIntoMarkingDisabledReason({ associatedMarkingCount: 2, eligibleCount: 1, loadError: null })).toBeNull();
  });
});
