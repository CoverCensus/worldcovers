/**
 * issues.md 138 -- "so they know which screen they are on".
 *
 * Ian asked for this twice:
 *
 *   2026-08-27: "Catalog detail MARKING ABOVE IMAGE then on associated covers"
 *   2026-09-15: "change associated thumnails to Associated Marking thumbnails
 *                and do the same on the covers screen so they know which
 *                screen they are on"
 *
 * It shipped in PR #137 and reached production -- but nothing guarded the
 * wording. Verification on 2026-09-21 found both strings present in the live
 * bundles and **zero** assertions protecting them, so any refactor could have
 * quietly reverted a request he had already made twice, with every suite still
 * green. That gap is what this file closes.
 *
 * Follows the precedent in labels/guidelines.test.ts, which pins requested
 * copy verbatim and records who asked for it.
 */
import { ENTRY_LABELS } from "./entry";

describe("associated thumbnail headings", () => {
  it("names the marking screen on the marking screen", () => {
    expect(ENTRY_LABELS.associatedThumbnails.marking).toBe("Associated Marking Thumbnails");
  });

  it("names the cover screen on the cover screen", () => {
    expect(ENTRY_LABELS.associatedThumbnails.cover).toBe("Associated Cover Thumbnails");
  });

  it("never lets the two screens read alike", () => {
    // The similarity IS the defect: the two detail screens share one
    // two-column shell, so identical headings are how an editor loses track of
    // which record they are editing.
    const { marking, cover } = ENTRY_LABELS.associatedThumbnails;
    expect(marking).not.toBe(cover);
    expect(marking).toMatch(/marking/i);
    expect(cover).toMatch(/cover/i);
  });
});
