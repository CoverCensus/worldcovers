import { readSubmission } from "@/lib/submission";
import {
  contributionCardPresentation,
  entryKindForContribution,
  coverContributionDisplayLabel,
  coverContributionDisplayName,
  materializedCoverIdFromContribution,
} from "./contributionDisplay";

describe("materializedCoverIdFromContribution", () => {
  it("reads snake_case and camelCase cover ids", () => {
    expect(materializedCoverIdFromContribution(readSubmission({ cover_id: 12 }).data)).toBe(12);
    expect(materializedCoverIdFromContribution(readSubmission({ coverId: "34" }).data)).toBe(34);
  });

  it("returns null for missing, empty, or invalid cover ids", () => {
    expect(materializedCoverIdFromContribution(readSubmission({}).data)).toBeNull();
    expect(materializedCoverIdFromContribution(readSubmission({ cover_id: "" }).data)).toBeNull();
    expect(materializedCoverIdFromContribution(readSubmission({ cover_id: "0" }).data)).toBeNull();
    expect(() => readSubmission({ cover_id: "abc" })).toThrow(/Submission.cover_id/);
  });
});

describe("coverContributionDisplayName", () => {
  it("uses the submitted location before the parent location", () => {
    expect(
      coverContributionDisplayName(
        readSubmission({ type: "FL", town: "Alexandria", state: "VA", parent_marking_id: 12 }).data,
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Alexandria, VA - Folded Letter");
  });

  it("uses the parent location when the submission has none", () => {
    expect(
      coverContributionDisplayName(
        readSubmission({ type: "FC", parent_marking_id: 12 }).data,
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Richmond, VA - Folded Cover");
  });

  it("omits missing locations and keeps non-draft wording", () => {
    expect(coverContributionDisplayName(readSubmission({ type: "FL" }).data, 7)).toBe("Folded Letter");
  });

  it("formats a partial date", () => {
    expect(
      coverContributionDisplayName(
        readSubmission({
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

describe("coverContributionDisplayLabel", () => {
  const submitted = { type: "FL", parent_marking_id: 12 };

  it("prefers a camel-case API display name", () => {
    expect(
      coverContributionDisplayLabel(
        { displayName: "Richmond, VA - Folded Letter" },
        submitted,
        7,
      ),
    ).toBe("Richmond, VA - Folded Letter");
  });

  it("prefers a snake-case API display name", () => {
    expect(
      coverContributionDisplayLabel(
        { display_name: "Norfolk, VA - Folded Letter" },
        submitted,
        7,
      ),
    ).toBe("Norfolk, VA - Folded Letter");
  });

  it("uses the local fallback for a blank API display name", () => {
    expect(
      coverContributionDisplayLabel(
        { displayName: "  " },
        submitted,
        7,
        { town: "Petersburg", state: "VA" },
      ),
    ).toBe("Petersburg, VA - Folded Letter");
  });
});

describe("contributionCardPresentation", () => {
  it("separates a Cover title, Entry type, status-independent fields", () => {
    expect(
      contributionCardPresentation({
        id: 7,
        submittedData: readSubmission({
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
      contributionCardPresentation({
        id: 8,
        submittedData: readSubmission({
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
      contributionCardPresentation({
        id: 9,
        submittedData: readSubmission({ submission_kind: "cover", type: "FC", parent_marking_id: 12 }).data,
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
describe("entryKindForContribution", () => {
  it("trusts an explicit submission_kind", () => {
    expect(entryKindForContribution(readSubmission({ submission_kind: "cover" }).data)).toBe("Cover");
    expect(entryKindForContribution(readSubmission({ submission_kind: "marking" }).data)).toBe("Marking");
  });

  it("reads a legacy cover row with no submission_kind", () => {
    // Parent marking, a cover type, no town, no marking type.
    expect(
      entryKindForContribution(readSubmission({ parent_marking_id: 12, type: "FL" }).data),
    ).toBe("Cover");
  });

  it("reads a legacy marking row with no submission_kind", () => {
    expect(
      entryKindForContribution(readSubmission({ town: "RICHMOND", type: "TOWNMARK" }).data),
    ).toBe("Marking");
  });

  it("calls an ambiguous legacy row a Marking rather than guessing Cover", () => {
    // No parent, no type, no date: nothing says cover. Defaulting to Marking
    // keeps it on the screen that shows every field, so an editor can see what
    // it actually is instead of a cover form with blanks.
    expect(entryKindForContribution(readSubmission({}).data)).toBe("Marking");
  });
});

describe("new cover types (Trello T67)", () => {
  it("treats every cover type code as a cover, not only FC and FL", () => {
    for (const type of ["FLF", "ENV", "ENVF", "UNK"]) {
      expect(entryKindForContribution(readSubmission({ parent_marking_id: 12, type }).data)).toBe("Cover");
    }
  });

  it("labels the new codes in the display name", () => {
    expect(coverContributionDisplayName(readSubmission({ type: "FLF" }).data, 7)).toBe("Folded Letter Front");
    expect(coverContributionDisplayName(readSubmission({ type: "ENVF" }).data, 7)).toBe("Envelope Front");
    expect(coverContributionDisplayName(readSubmission({ type: "UNK" }).data, 7)).toBe("Unknown");
  });
});
