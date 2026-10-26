import type { AssociatedCover } from "@/services/markings";
import {
  COVER_MATCH_LABEL,
  COVER_POSSIBLE_LABEL,
  MATCH_LABEL,
  describeSimilarMarking,
  findSimilarCovers,
} from "@/lib/similarEntries";

function cover(id: number, type: string | null, dates: Array<[number, number | null, number | null]>): AssociatedCover {
  return {
    id: id * 100,
    reviewStatus: "approved",
    reviewNotes: null,
    reviewedAt: null,
    reviewerUsername: "",
    isBackstamp: false,
    placement: null,
    coverDetails: {
      id,
      code: `C-${id}`,
      colorId: null,
      colorName: "",
      type,
      width: null,
      height: null,
      hasAdhesive: null,
      isInstitutional: null,
      displaySubmitterName: false,
      canChangeSubmitterName: false,
      description: "",
      datesSeen: dates.map(([y, m, d], i) => ({
        id: i + 1,
        date: `${y}-${String(m ?? 1).padStart(2, "0")}-${String(d ?? 1).padStart(2, "0")}`,
        granularity: d ? "DAY" : m ? "MONTH" : "YEAR",
        dateYear: y,
        dateMonth: m,
        dateDay: d,
      })),
    },
  } as AssociatedCover;
}

const date = (year: string, month = "", day = "") => ({ unknown: false, year, month, day });

describe("findSimilarCovers", () => {
  const siblings = [
    cover(1, "FL", [[1850, null, null]]),
    cover(2, "ENV", [[1850, 3, 4]]),
    cover(3, "FL", [[1851, null, null]]),
    cover(4, "UNK", []),
    cover(5, "FL", [[1850, 3, 4]]),
  ];

  it("suggests nothing until a year is typed", () => {
    expect(findSimilarCovers(siblings, { type: "FL", coverDate: date("") }, 42, null)).toEqual([]);
    expect(findSimilarCovers(siblings, { type: "FL", coverDate: { ...date("1850"), unknown: true } }, 42, null)).toEqual([]);
  });

  it("matches on type and date where both are known, treating unknown as compatible", () => {
    const rows = findSimilarCovers(siblings, { type: "FL", coverDate: date("1850", "3", "4") }, 42, null);
    expect(rows.map((r) => r.id)).toEqual([1, 4, 5]);
    expect(rows.map((r) => r.tierLabel)).toEqual([COVER_MATCH_LABEL, COVER_POSSIBLE_LABEL, COVER_MATCH_LABEL]);
    expect(rows[0].href).toBe("/record/42/cover/1");
  });

  it("skips the edited cover and rows without details", () => {
    const withDraft = [...siblings, { ...cover(6, "FL", [[1850, null, null]]), coverDetails: null }];
    const rows = findSimilarCovers(withDraft, { type: "", coverDate: date("1850") }, 42, 1);
    expect(rows.map((r) => r.id)).toEqual([2, 4, 5]);
  });
});

describe("describeSimilarMarking", () => {
  it("builds a title, a detail line and a tier label", () => {
    const row = describeSimilarMarking({
      id: 7, tier: "match", town: "Abingdon", stateAbbrev: "VA", type: "TOWNMARK",
      inscription: "ABINGDON/VA.", isManuscript: false, shapeName: "C - Circle", colorName: "BLACK",
      colorHex: "#000000", width: "24", height: "24", earliestSeen: "1813-01-01", latestSeen: "1813-01-01",
      mainImageUrl: null,
    });
    expect(row.href).toBe("/record/7");
    expect(row.title).toContain("Abingdon");
    expect(row.title).toContain("ABINGDON/VA.");
    expect(row.detail).toContain("24 mm diameter");
    expect(row.detail).toContain("BLACK");
    expect(row.tierLabel).toBe(MATCH_LABEL);
  });
});
