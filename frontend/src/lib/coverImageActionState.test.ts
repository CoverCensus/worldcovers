/**
 * Workspace issues.md #180 / Trello T37 -- the cover screen hid "Move to
 * marking" when the cover had no associated Marking, the same defect the
 * marking screen fixed under issues.md 166: a hidden control reads as a
 * missing feature.
 */
import { moveToMarkingDisabledReason } from "./coverImageActionState";

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
