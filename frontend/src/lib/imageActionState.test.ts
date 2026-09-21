/**
 * issues.md 166 -- the crop control is invisible until the image is saved.
 *
 * John Howker (Delaware editor) lost two days to this. He uploaded a cover
 * photograph into the marking form and saw only the star and two arrows:
 *
 *   "I was looking for the little icon that would allow me to chop out the
 *    marking from the cover, as you did in the demo."
 *
 * He diagnosed it himself the next day -- "I had no idea I should be saving
 * the cover at that stage" -- which is the strongest evidence it is a
 * discoverability defect and not a capability one.
 *
 * The cause is one boolean standing in for three unrelated reasons
 * (RecordDetail.tsx: `isStaff && !record.isRemoved && img.imageId != null`).
 * All three produce the same outcome -- nothing on screen -- and only one of
 * them has any other visible signal. A removed marking shows a recycle-bin
 * banner; a signed-out visitor never expected the controls. An unsaved image
 * says nothing at all, so that is the case this module exists to name.
 */
import { imageActionState } from "./imageActionState";

describe("imageActionState", () => {
  it("lets an editor manage a saved image on a live marking", () => {
    const state = imageActionState({ imageId: 5869, isStaff: true, isRemoved: false });
    expect(state.showControls).toBe(true);
    expect(state.isSaved).toBe(true);
    expect(state.disabledReason).toBeNull();
  });

  it("names the unsaved image as the reason crop and move cannot be used", () => {
    const state = imageActionState({ imageId: null, isStaff: true, isRemoved: false });
    // The controls must still render -- disabled with this reason attached --
    // rather than vanishing, which is the whole point of the issue.
    expect(state.showControls).toBe(true);
    expect(state.isSaved).toBe(false);
    expect(state.disabledReason).toMatch(/saved/i);
  });

  it("reports nothing to manage for a signed-out visitor", () => {
    // A public visitor must not see greyed-out editor tools, so there is no
    // reason text to render either.
    const state = imageActionState({ imageId: 5869, isStaff: false, isRemoved: false });
    expect(state.showControls).toBe(false);
    expect(state.disabledReason).toBeNull();
  });

  it("puts the recycle bin ahead of an unsaved image when both apply", () => {
    // A removed marking is read-only for everyone; only Restore survives. That
    // is the more actionable of the two reasons, so it wins.
    const state = imageActionState({ imageId: null, isStaff: true, isRemoved: true });
    expect(state.showControls).toBe(true);
    expect(state.disabledReason).toMatch(/recycle bin/i);
  });
});
