/**
 * issues.md 167 / Trello T37 -- the marking screen hands an image to the cover
 * form through router state.
 *
 * This is a contract between two screens that never import each other, so it is
 * exactly the kind of thing that rots when one side is refactored. Rejecting a
 * half-formed descriptor matters more than accepting a good one: a silently
 * broken seed means the editor submits a cover with no picture and cannot tell.
 */
import {
  markingImageFromSourceMarkingImage,
  sourceMarkingImageFromContribution,
  sourceMarkingImageFromState,
} from "./coverFromImageHandoff";

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

describe("sourceMarkingImageFromContribution", () => {
  // Trello T37: a saved draft has no router state, so the same descriptor
  // comes back from the contribution detail endpoint in the server's shape.
  it("reads the snake_case descriptor the detail endpoint returns", () => {
    const got = sourceMarkingImageFromContribution({
      source_marking_image: {
        id: 10856,
        image_url: "https://woco.dev/media/fl/alligator.png",
        original_filename: "alligator.png",
        storage_filename: "fl/alligator.png",
        marking_id: 48567,
      },
    });

    expect(got).toEqual({
      imageId: 10856,
      imageUrl: "https://woco.dev/media/fl/alligator.png",
      originalFilename: "alligator.png",
      storageFilename: "fl/alligator.png",
    });
  });

  it("tolerates a camelCased response", () => {
    const got = sourceMarkingImageFromContribution({
      sourceMarkingImage: { imageId: 10856, imageUrl: "/media/fl/alligator.png" },
    });

    expect(got?.imageId).toBe(10856);
  });

  it("returns nothing for an ordinary submission or one whose image moved away", () => {
    // The server answers null in both cases; a missing key means an older
    // server that predates the field.
    expect(sourceMarkingImageFromContribution({ source_marking_image: null })).toBeNull();
    expect(sourceMarkingImageFromContribution({})).toBeNull();
  });

  it("refuses a descriptor with nothing to repoint or nothing to show", () => {
    expect(
      sourceMarkingImageFromContribution({ source_marking_image: { id: 0, image_url: "/x.png" } }),
    ).toBeNull();
    expect(
      sourceMarkingImageFromContribution({ source_marking_image: { id: 10856, image_url: "" } }),
    ).toBeNull();
  });
});

describe("markingImageFromSourceMarkingImage", () => {
  it("builds the gallery row with its real id on the MARKING subject", () => {
    const row = markingImageFromSourceMarkingImage(
      { imageId: 10856, imageUrl: "/media/fl/alligator.png" },
      48567,
    );

    expect(row.imageId).toBe(10856);
    expect(row.subjectType).toBe("MARKING");
    expect(row.subjectId).toBe(48567);
    expect(row.imageUrl).toBe("/media/fl/alligator.png");
    // Blank rather than undefined: MarkingImage fields are plain strings.
    expect(row.originalFilename).toBe("");
    expect(row.storageFilename).toBe("");
    expect(row.isTracing).toBe(false);
  });
});
