/**
 * issues.md 174 — Ian, 2026-09-23: covers under a marking are "sorted
 * earliest to latest in the cover thumbnail area", with the date shown.
 * Dates live in DateSeen rows with their own precision; a year-only
 * observation sorts as that year, and an undated cover goes last.
 */
import type { AssociatedCover, AssociatedDateSeen } from "@/services/markings";
import { earliestDateSeen, sortCoversEarliestFirst } from "./associatedCoverSort";

function seen(over: Partial<AssociatedDateSeen>): AssociatedDateSeen {
  return { id: 1, date: null, granularity: "DAY", dateYear: null, dateMonth: null, dateDay: null, ...over };
}

function cover(id: number, datesSeen: AssociatedDateSeen[]): AssociatedCover {
  return {
    id,
    reviewStatus: "approved",
    reviewNotes: null,
    reviewedAt: null,
    reviewerUsername: "",
    isBackstamp: false,
    placement: null,
    coverDetails: {
      id, code: `C-${id}`, colorId: null, colorName: "", type: "FL", width: null, height: null,
      hasAdhesive: null, isInstitutional: null, displaySubmitterName: false, description: "",
      datesSeen,
    },
  } as AssociatedCover;
}

describe("earliestDateSeen", () => {
  it("prefers the sortable date, then falls back to the year/month/day parts", () => {
    const full = seen({ id: 1, date: "1847-08-03", granularity: "DAY" });
    const yearOnly = seen({ id: 2, granularity: "YEAR", dateYear: 1832 });
    expect(earliestDateSeen([full, yearOnly])).toBe(yearOnly);
    expect(earliestDateSeen([full])).toBe(full);
  });

  it("returns null when nothing carries a year", () => {
    expect(earliestDateSeen([])).toBeNull();
    expect(earliestDateSeen([seen({ granularity: "MONTH_ONLY", dateMonth: 5 })])).toBeNull();
  });
});

describe("sortCoversEarliestFirst", () => {
  it("orders day, month and year precisions together, undated last, ties stable", () => {
    const a = cover(1, [seen({ date: "1851-02-10" })]);
    const b = cover(2, [seen({ granularity: "YEAR", dateYear: 1832 })]);
    const c = cover(3, []);
    const d = cover(4, [seen({ granularity: "MONTH", dateYear: 1832, dateMonth: 6 })]);
    const e = cover(5, [seen({ granularity: "YEAR", dateYear: 1832 })]);
    expect(sortCoversEarliestFirst([a, b, c, d, e]).map((x) => x.id)).toEqual([2, 5, 4, 1, 3]);
  });

  it("uses a cover's earliest observation, not its first", () => {
    const later = seen({ id: 1, date: "1860-01-01" });
    const earlier = seen({ id: 2, date: "1840-01-01" });
    const x = cover(1, [later, earlier]);
    const y = cover(2, [seen({ date: "1850-01-01" })]);
    expect(sortCoversEarliestFirst([y, x]).map((c) => c.id)).toEqual([1, 2]);
  });

  it("does not mutate the input", () => {
    const list = [cover(1, []), cover(2, [seen({ date: "1840-01-01" })])];
    sortCoversEarliestFirst(list);
    expect(list.map((c) => c.id)).toEqual([1, 2]);
  });
});
