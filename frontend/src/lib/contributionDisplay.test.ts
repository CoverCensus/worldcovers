import {
  contributionCardPresentation,
  coverContributionDisplayLabel,
  coverContributionDisplayName,
  materializedCoverIdFromContribution,
} from "./contributionDisplay";

describe("materializedCoverIdFromContribution", () => {
  it("reads snake_case and camelCase cover ids", () => {
    expect(materializedCoverIdFromContribution({ cover_id: 12 })).toBe(12);
    expect(materializedCoverIdFromContribution({ coverId: "34" })).toBe(34);
  });

  it("returns null for missing, empty, or invalid cover ids", () => {
    expect(materializedCoverIdFromContribution({})).toBeNull();
    expect(materializedCoverIdFromContribution({ cover_id: "" })).toBeNull();
    expect(materializedCoverIdFromContribution({ cover_id: "0" })).toBeNull();
    expect(materializedCoverIdFromContribution({ cover_id: "abc" })).toBeNull();
  });
});

describe("coverContributionDisplayName", () => {
  it("uses the submitted location before the parent location", () => {
    expect(
      coverContributionDisplayName(
        { type: "FL", town: "Alexandria", state: "VA", parent_marking_id: 12 },
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Alexandria, VA - Folded Letter");
  });

  it("uses the parent location when the submission has none", () => {
    expect(
      coverContributionDisplayName(
        { type: "FC", parent_marking_id: 12 },
        7,
        { town: "Richmond", state: "VA" },
      ),
    ).toBe("Richmond, VA - Folded Cover");
  });

  it("omits missing locations and keeps non-draft wording", () => {
    expect(coverContributionDisplayName({ type: "FL" }, 7)).toBe("Folded Letter");
  });

  it("formats a partial date", () => {
    expect(
      coverContributionDisplayName(
        {
          type: "FL",
          cover_date_year: 1863,
          cover_date_month: 6,
          parent_marking_id: 12,
        },
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
        submittedData: {
          submission_kind: "cover",
          type: "FL",
          parent_marking_id: 12,
          cover_date_year: 1863,
          cover_date_month: 6,
        },
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
        submittedData: {
          submission_kind: "marking",
          type: "TOWNMARK",
          inscription_txt: "RICHMOND VA",
          marking_erd_date_year: 1851,
          marking_lrd_date_year: 1854,
          shape: "C - Circle",
          width_mm: 27,
          height_mm: 27,
          color: "Red",
        },
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
        submittedData: { submission_kind: "cover", type: "FC", parent_marking_id: 12 },
      }).title,
    ).toBe("Submission #9");
  });
});
