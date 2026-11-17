import { readSubmittedData } from "@/lib/submission";
import {
  submissionCardPresentation,
  entryKindForSubmission,
  coverSubmissionDisplayLabel,
  coverSubmissionDisplayName,
  materializedCoverIdFromSubmission,
} from "./submissionDisplay";

describe("materializedCoverIdFromSubmission", () => {
  it("reads snake_case and camelCase cover ids", () => {
    expect(materializedCoverIdFromSubmission(readSubmittedData({ cover_id: 12 }).data)).toBe(12);
    expect(materializedCoverIdFromSubmission(readSubmittedData({ coverId: "34" }).data)).toBe(34);
  });

  it("returns null for missing, empty, or invalid cover ids", () => {
    expect(materializedCoverIdFromSubmission(readSubmittedData({}).data)).toBeNull();
    expect(materializedCoverIdFromSubmission(readSubmittedData({ cover_id: "" }).data)).toBeNull();
    expect(materializedCoverIdFromSubmission(readSubmittedData({ cover_id: "0" }).data)).toBeNull();
    expect(() => readSubmittedData({ cover_id: "abc" })).toThrow(/Submission.cover_id/);
  });
});

describe("coverSubmissionDisplayName", () => {
  it("uses the submitted location before the parent location", () => {
    expect(
      coverSubmissionDisplayName(
        readSubmittedData({ type: "FL", town: "Alexandria", state: "VA", parent_marking_id: 12 }).data,
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Alexandria, VA - Folded Letter");
  });

  it("uses the parent location when the submission has none", () => {
    expect(
      coverSubmissionDisplayName(
        readSubmittedData({ type: "FC", parent_marking_id: 12 }).data,
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Richmond, VA - Folded Cover");
  });

  it("omits missing locations and keeps non-draft wording", () => {
    expect(coverSubmissionDisplayName(readSubmittedData({ type: "FL" }).data, 7)).toBe("Folded Letter");
  });

  it("formats a partial date", () => {
    expect(
      coverSubmissionDisplayName(
        readSubmittedData({
          type: "FL",
          cover_date_year: 1863,
          cover_date_month: 6,
          parent_marking_id: 12,
        }).data,
        7,
      ),
    ).toBe("Folded Letter - JUN, 1863");
  });
});

describe("coverSubmissionDisplayLabel", () => {
  const submitted = { type: "FL", parent_marking_id: 12 };

  it("prefers a camel-case API display name", () => {
    expect(
      coverSubmissionDisplayLabel(
        { displayName: "Richmond, VA - Folded Letter" },
        submitted,
        7,
      ),
    ).toBe("Richmond, VA - Folded Letter");
  });

  it("prefers a snake-case API display name", () => {
    expect(
      coverSubmissionDisplayLabel(
        { display_name: "Norfolk, VA - Folded Letter" },
        submitted,
        7,
      ),
    ).toBe("Norfolk, VA - Folded Letter");
  });

  it("uses the local fallback for a blank API display name", () => {
    expect(
      coverSubmissionDisplayLabel(
        { displayName: "  " },
        submitted,
        7,
        { town: "Petersburg", state: "VA" },
      ),
    ).toBe("Petersburg, VA - Folded Letter");
  });
});

describe("submissionCardPresentation", () => {
  it("separates a Cover title, Entry type, status-independent fields", () => {
    expect(
      submissionCardPresentation({
        id: 7,
        submittedData: readSubmittedData({
          submission_kind: "cover",
          type: "FL",
          parent_marking_id: 12,
          cover_date_year: 1863,
          cover_date_month: 6,
        }).data,
        town: "Alexandria",
        state: "VA",
      }),
    ).toEqual({
      entryKind: "Cover",
      title: "Alexandria, VA",
      fields: [
        { label: "Cover type", value: "Folded Letter" },
        { label: "Cover date", value: "JUN, 1863" },
      ],
    });
  });

  it("uses the same structure with Marking-specific fields", () => {
    expect(
      submissionCardPresentation({
        id: 8,
        submittedData: readSubmittedData({
          submission_kind: "marking",
          type: "TOWNMARK",
          inscription_txt: "RICHMOND VA",
          marking_erd_date_year: 1851,
          marking_lrd_date_year: 1854,
          shape: "C - Circle",
          width_mm: 27,
          height_mm: 27,
          color: "Red",
        }).data,
        town: "Richmond",
        state: "VA",
      }),
    ).toEqual({
      entryKind: "Marking",
      title: "Richmond, VA",
      fields: [
        { label: "Marking type", value: "Townmark" },
        { label: "Inscription", value: '"RICHMOND VA"' },
        { label: "Date seen", value: "1851 - 1854" },
        { label: "Shape", value: "C - Circle" },
        { label: "Size", value: "27x27 mm" },
        { label: "Colour", value: "Red" },
      ],
    });
  });

  it("uses an honest fallback when location is unavailable", () => {
    expect(
      submissionCardPresentation({
        id: 9,
        submittedData: readSubmittedData({ submission_kind: "cover", type: "FC", parent_marking_id: 12 }).data,
      }).title,
    ).toBe("Submission #9");
  });
});

/**
 * Ian, 2026-09-21: "from this I do not know if it is a cover he is submitting
 * or a marking. Could it say which it is on the screen."
 *
 * The badge uses the same predicate the page dispatches on, so these also pin
 * which screen renders. The heuristic branch matters more than it looks:
 * CoverEdit stamps `submission_kind`, but the marking form never has, and the
 * backend only started defaulting it at views.py:3481 -- so older rows carry
 * neither and fall through to the guesswork below.
 */
describe("entryKindForSubmission", () => {
  it("trusts an explicit submission_kind", () => {
    expect(entryKindForSubmission(readSubmittedData({ submission_kind: "cover" }).data)).toBe("Cover");
    expect(entryKindForSubmission(readSubmittedData({ submission_kind: "marking" }).data)).toBe("Marking");
  });

  it("reads a legacy cover row with no submission_kind", () => {
    // Parent marking, a cover type, no town, no marking type.
    expect(
      entryKindForSubmission(readSubmittedData({ parent_marking_id: 12, type: "FL" }).data),
    ).toBe("Cover");
  });

  it("reads a legacy marking row with no submission_kind", () => {
    expect(
      entryKindForSubmission(readSubmittedData({ town: "RICHMOND", type: "TOWNMARK" }).data),
    ).toBe("Marking");
  });

  it("calls an ambiguous legacy row a Marking rather than guessing Cover", () => {
    // No parent, no type, no date: nothing says cover. Defaulting to Marking
    // keeps it on the screen that shows every field, so an editor can see what
    // it actually is instead of a cover form with blanks.
    expect(entryKindForSubmission(readSubmittedData({}).data)).toBe("Marking");
  });
});

describe("new cover types (Trello T67)", () => {
  it("treats every cover type code as a cover, not only FC and FL", () => {
    for (const type of ["FLF", "ENV", "ENVF", "UNK"]) {
      expect(entryKindForSubmission(readSubmittedData({ parent_marking_id: 12, type }).data)).toBe("Cover");
    }
  });

  it("labels the new codes in the display name", () => {
    expect(coverSubmissionDisplayName(readSubmittedData({ type: "FLF" }).data, 7)).toBe("Folded Letter Front");
    expect(coverSubmissionDisplayName(readSubmittedData({ type: "ENVF" }).data, 7)).toBe("Envelope Front");
    expect(coverSubmissionDisplayName(readSubmittedData({ type: "UNK" }).data, 7)).toBe("Unknown");
  });
});
