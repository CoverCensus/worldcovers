// issues.md 107 — helpers behind the Dates seen card. Rows with no sortable
// date (MONTH_ONLY etc.) never set Earliest/Latest and sort DB-dependently on
// the server, so ordering and the "range-bearing" test live here.
import { isRangeBearing, MONTH_OPTIONS, sortDateSeenRows } from "./partialDate";

const row = (id: number, over: Partial<{ dateYear: number | null; dateMonth: number | null; dateDay: number | null; date: string | null }>) => ({
  id,
  date: null as string | null,
  granularity: "YEAR" as const,
  dateYear: null as number | null,
  dateMonth: null as number | null,
  dateDay: null as number | null,
  ...over,
});

describe("isRangeBearing", () => {
  it("is true only for the precisions that carry a sortable date", () => {
    expect(isRangeBearing("DAY")).toBe(true);
    expect(isRangeBearing("MONTH")).toBe(true);
    expect(isRangeBearing("YEAR")).toBe(true);
    expect(isRangeBearing("MONTH_ONLY")).toBe(false);
    expect(isRangeBearing("DAY_ONLY")).toBe(false);
    expect(isRangeBearing("YEAR_DAY")).toBe(false);
    expect(isRangeBearing("MONTH_DAY")).toBe(false);
    expect(isRangeBearing(null)).toBe(false);
  });
});

describe("sortDateSeenRows", () => {
  it("orders by year, then month, then day, with yearless rows last and ties stable", () => {
    const rows = [
      row(1, { dateYear: 1851, dateMonth: 2, dateDay: 10 }),
      row(2, { dateMonth: 6 }),                      // MONTH_ONLY: no year
      row(3, { dateYear: 1832 }),
      row(4, { dateYear: 1832, dateMonth: 6 }),
      row(5, { dateYear: 1832 }),                     // ties with 3, keeps order
    ];
    expect(sortDateSeenRows(rows).map((r) => r.id)).toEqual([3, 5, 4, 1, 2]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]); // input untouched
  });
});

describe("MONTH_OPTIONS", () => {
  it("lists twelve months keyed 1-12", () => {
    expect(MONTH_OPTIONS.map((o) => o.value)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    );
    expect(MONTH_OPTIONS[0].label).toBe("JAN");
  });
});
