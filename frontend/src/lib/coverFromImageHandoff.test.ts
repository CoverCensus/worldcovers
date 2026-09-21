/**
 * issues.md 167 / Trello T37 -- the marking screen hands an image to the cover
 * form through router state.
 *
 * This is a contract between two screens that never import each other, so it is
 * exactly the kind of thing that rots when one side is refactored. Rejecting a
 * half-formed descriptor matters more than accepting a good one: a silently
 * broken seed means the editor submits a cover with no picture and cannot tell.
 */
import { sourceMarkingImageFromState } from "./coverFromImageHandoff";

describe("sourceMarkingImageFromState", () => {
  it("reads the descriptor the marking screen sends", () => {
    const got = sourceMarkingImageFromState({
      from: "/record/48567",
      sourceMarkingImage: {
        imageId: 10856,
        imageUrl: "/media/fl/alligator.png",
        originalFilename: "alligator.png",
        storageFilename: "fl/alligator.png",
      },
    });

    expect(got).toEqual({
      imageId: 10856,
      imageUrl: "/media/fl/alligator.png",
      originalFilename: "alligator.png",
      storageFilename: "fl/alligator.png",
    });
  });

  it("returns nothing for an ordinary Submit New Cover visit", () => {
    // The same route is reached from the plain button, which sends only `from`.
    expect(sourceMarkingImageFromState({ from: "/record/48567" })).toBeNull();
    expect(sourceMarkingImageFromState(null)).toBeNull();
  });

  it("refuses a draft-preview image, which has nothing to repoint", () => {
    // Negative ids are the draft-contribution sentinel from contributionImages:
    // not catalog rows, so approval could never repoint them.
    expect(
      sourceMarkingImageFromState({
        sourceMarkingImage: { imageId: -1, imageUrl: "/media/fl/x.png" },
      }),
    ).toBeNull();
  });

  it("refuses a descriptor with no image to fetch", () => {
    expect(
      sourceMarkingImageFromState({ sourceMarkingImage: { imageId: 10856, imageUrl: "" } }),
    ).toBeNull();
  });

  it("treats blank filenames as absent rather than passing empty strings on", () => {
    const got = sourceMarkingImageFromState({
      sourceMarkingImage: { imageId: 10856, imageUrl: "/media/fl/x.png", originalFilename: "  " },
    });

    expect(got?.originalFilename).toBeUndefined();
  });
});
