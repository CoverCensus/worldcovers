/**
 * issues.md 167 / Trello T37 -- spotting a whole-cover photograph that is
 * sitting on a marking record.
 *
 * Ian, 2026-09-15: "We need something on the marking thumbnails section when it
 * identifies a cover being used for the marking image that then asks if they
 * want to add this cover to the cover section - if so, all is needed is the
 * date and then it creates the cover, moves the cover image and clears it from
 * Marking Thumbails."
 *
 * The detection half already exists. classifyImageShape has been classifying
 * uploads since issues.md 76, with thresholds measured off both live sites and
 * ~91% recall against the only labelled set available. This module does not
 * re-derive any of that -- it feeds stored dimensions into the same helper so
 * the nudge can also apply to images already in the catalog.
 *
 * Fixtures use real measurements, following lib/imageShape.test.ts's own rule
 * that thresholds are pinned against production data rather than invented
 * numbers. 197x232 is image 5869 from the 2026-08-18 C3 rehearsal.
 */
import { coverLikeMarkingImages, isLastMarkingImage } from "./coverLikeMarkingImages";
import type { MarkingImage } from "@/services/markings";

const img = (over: Partial<MarkingImage> = {}): MarkingImage =>
  ({
    imageId: 5869,
    subjectType: "MARKING",
    subjectId: 31110,
    imageUrl: "/media/va/scan.png",
    imageView: "FULL",
    originalFilename: "scan.png",
    storageFilename: "va/scan.png",
    imageDescription: "",
    isTracing: false,
    displayOrder: 0,
    imageWidth: 1600,
    imageHeight: 1200,
    ...over,
  }) as MarkingImage;

describe("coverLikeMarkingImages", () => {
  it("flags a large landscape scan as a whole cover", () => {
    const flagged = coverLikeMarkingImages([img({ imageWidth: 1600, imageHeight: 1200 })]);
    expect(flagged.map((i) => i.imageId)).toEqual([5869]);
  });

  it("leaves a small square marking closeup alone", () => {
    // Image 5869 as actually cropped: 197x232. Prompting on this would train
    // editors to dismiss the prompt.
    const flagged = coverLikeMarkingImages([img({ imageWidth: 197, imageHeight: 232 })]);
    expect(flagged).toEqual([]);
  });

  it("says nothing about an image already attached to a cover", () => {
    // Its subject is already right; there is nothing to offer.
    const flagged = coverLikeMarkingImages([img({ subjectType: "COVER" })]);
    expect(flagged).toEqual([]);
  });

  it("stays quiet on a legacy row with no recorded dimensions", () => {
    const flagged = coverLikeMarkingImages([img({ imageWidth: 0, imageHeight: 0 })]);
    expect(flagged).toEqual([]);
  });

  it("stays quiet in the ambiguous middle band", () => {
    // 800x600 is neither a clear cover nor a clear closeup. Warning on the
    // genuinely ambiguous band is what makes a nudge into noise.
    const flagged = coverLikeMarkingImages([img({ imageWidth: 800, imageHeight: 600 })]);
    expect(flagged).toEqual([]);
  });
});

describe("isLastMarkingImage", () => {
  it("is true when the marking has only this one picture", () => {
    // Moving it would leave the record with no image at all -- the exact
    // situation the crop feature exists to prevent.
    expect(isLastMarkingImage([img()], 5869)).toBe(true);
  });

  it("is false when a sibling marking image would remain", () => {
    expect(isLastMarkingImage([img(), img({ imageId: 5956, displayOrder: 1 })], 5869)).toBe(false);
  });

  it("does not count cover images as pictures the marking keeps", () => {
    // A COVER-subject row in this list belongs to an associated cover, not to
    // the marking, so it cannot stand in as the marking's remaining picture.
    expect(isLastMarkingImage([img(), img({ imageId: 7000, subjectType: "COVER" })], 5869)).toBe(
      true,
    );
  });
});
