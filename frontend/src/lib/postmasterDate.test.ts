import { partsFromTenureDate, tenurePayloadDate } from "./postmasterDate";

const parts = (over: Partial<{ unknown: boolean; year: string; month: string; day: string }>) => ({
  unknown: false, year: "", month: "", day: "", ...over,
});

describe("tenurePayloadDate", () => {
  it("stores a year alone as a YEAR-precision 1 January", () => {
    expect(tenurePayloadDate(parts({ year: "1840" }))).toEqual({
      ok: true, value: { date_appointed: "1840-01-01", date_appointed_granularity: "YEAR" },
    });
  });
  it("stores year and month as MONTH precision on the 1st", () => {
    expect(tenurePayloadDate(parts({ year: "1840", month: "7" }))).toEqual({
      ok: true, value: { date_appointed: "1840-07-01", date_appointed_granularity: "MONTH" },
    });
  });
  it("stores a full date as DAY precision", () => {
    expect(tenurePayloadDate(parts({ year: "1840", month: "7", day: "4" }))).toEqual({
      ok: true, value: { date_appointed: "1840-07-04", date_appointed_granularity: "DAY" },
    });
  });
  it("refuses a month without a year", () => {
    const result = tenurePayloadDate(parts({ month: "7" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/needs a year/) });
  });
  it("asks for the month when a year and day come without one", () => {
    const result = tenurePayloadDate(parts({ year: "1840", day: "4" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Add the month or clear the day/) });
  });
  it("sends nulls for an unknown or blank date", () => {
    expect(tenurePayloadDate(parts({ unknown: true }))).toEqual({
      ok: true, value: { date_appointed: null, date_appointed_granularity: null },
    });
    expect(tenurePayloadDate(parts({}))).toEqual({
      ok: true, value: { date_appointed: null, date_appointed_granularity: null },
    });
  });
});

describe("partsFromTenureDate", () => {
  it("shows only the parts the stored precision covers", () => {
    expect(partsFromTenureDate("1840-01-01", "YEAR")).toEqual({ unknown: false, year: "1840", month: "", day: "" });
    expect(partsFromTenureDate("1840-07-01", "MONTH")).toEqual({ unknown: false, year: "1840", month: "7", day: "" });
    expect(partsFromTenureDate(null, "")).toEqual({ unknown: true, year: "", month: "", day: "" });
  });
});
