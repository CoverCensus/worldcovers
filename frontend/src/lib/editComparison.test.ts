import { readSubmission } from "@/lib/submission";
import { compareCoverEdit, compareMarkingEdit } from "./editComparison";

const lookups = { letteringOptions: [], dateFormatOptions: [] };
const marking = {
  state: "Virginia", state_abbrev: "VA", town: "Richmond", type: "TOWNMARK",
  inscription_txt: "RICHMOND VA", is_manuscript: false, is_irreg: false,
  shape: "Circle", shape_id: 2, color: "Black", color_id: 3,
  width_mm: "28.00", height_mm: "", desc: "Double circle",
  marking_erd: "1851-03-01", marking_erd_granularity: "MONTH",
  reference_work_ids: [11], reference_work_details: [{ reference_work_id: 11, page_number: "12", url: "" }],
};
const changedKeys = (rows: { key: string; changed: boolean }[]) =>
  rows.filter((r) => r.changed).map((r) => r.key);

describe("compareMarkingEdit", () => {
  const compare = (sd: Record<string, unknown>, intent?: Parameters<typeof compareMarkingEdit>[5]) =>
    compareMarkingEdit(readSubmission(marking).data, readSubmission(sd).data, lookups, [], 1, intent);

  it("leaves untouched fields unchanged and flags the edited one", () => {
    // What the form resubmits after changing only the colour; it omits dates it did not change.
    const rows = compare({
      edit_marking_id: "7", state: "Virginia", town: "Richmond", type: "TOWNMARK",
      inscription_txt: "RICHMOND VA", is_manuscript: "false", is_irreg: "false",
      shape: "Circle", shape_id: "2", color: "Red", color_id: "4", width_mm: "28", height_mm: "",
      desc: "Double circle", reference_work_ids: [11],
      reference_work_details: [{ reference_work_id: 11, page_number: "12", url: "" }],
    });
    expect(changedKeys(rows)).toEqual(["color"]);
    expect(rows.find((r) => r.key === "color")).toMatchObject({ current: "Black", proposed: "Red" });
  });

  it("keeps omitted fields but treats an explicit empty value as a clear", () => {
    const rows = compare({ edit_marking_id: 7, desc: "" });
    expect(changedKeys(rows)).toEqual(["description"]);
    expect(rows.find((r) => r.key === "description")?.proposed).toBe("");
  });

  it("treats the state's abbreviation as the same state", () => {
    expect(changedKeys(compare({ edit_marking_id: 7, state: "VA" }))).toEqual([]);
  });

  it("T70: a county the town already has is unchanged by id, an added one is noted, a differing one is left alone", () => {
    const withCounty = { ...marking, county: "Henrico", county_id: 5 };
    const same = compareMarkingEdit(readSubmission(withCounty).data, readSubmission({ edit_marking_id: 7, county: "Henrico", county_id: "5" }).data, lookups, [], 1);
    expect(changedKeys(same)).toEqual([]);
    expect(changedKeys(compareMarkingEdit(readSubmission(withCounty).data, readSubmission({ edit_marking_id: 7, county: "", county_id: "" }).data, lookups, [], 1))).toEqual([]);

    const added = compare({ edit_marking_id: 7, county: "Accomack", county_id: "9" });
    expect(added.find((r) => r.key === "county")).toMatchObject({ current: "", proposed: "Accomack", changed: true });

    // Without a server verdict the row only shows the names.
    const differs = compareMarkingEdit(readSubmission(withCounty).data, readSubmission({ edit_marking_id: 7, county: "Accomack", county_id: "9" }).data, lookups, [], 1);
    expect(differs.find((r) => r.key === "county")).toMatchObject({ current: "Henrico", proposed: "Accomack", changed: true });
    expect(differs.find((r) => r.key === "county")?.note).toBeUndefined();
  });

  it("T70: the server verdict names the county and compares against the town the edit points at", () => {
    const intent = {
      countyId: 9, countyName: "Accomack", valid: true, error: null, townFound: true,
      currentCounty: "Campbell", willLink: false,
      note: "Differs from the catalog's Campbell; approval leaves the county link unchanged", countyProposed: "",
    };
    const rows = compare({ edit_marking_id: 7, town: "Lynchburg", county: "accomack", county_id: "9" }, intent);
    expect(rows.find((r) => r.key === "county")).toMatchObject({
      current: "Campbell", proposed: "Accomack", changed: true, note: intent.note,
    });
    const linking = compare({ edit_marking_id: 7, county_id: "9" }, { ...intent, currentCounty: null, willLink: true, note: "Approval links the town to this county" });
    expect(linking.find((r) => r.key === "county")).toMatchObject({ current: "", proposed: "Accomack", changed: true, note: "Approval links the town to this county" });
    const refused = compare({ edit_marking_id: 7, county_id: "9" }, { ...intent, valid: false, countyName: "", error: "County 'Montgomery' is not in 'Virginia'.", note: "County 'Montgomery' is not in 'Virginia'." });
    expect(refused.find((r) => r.key === "county")?.note).toMatch(/is not in/);
  });

  it("clears shape for a manuscript and notes that dates are added", () => {
    const rows = compare({
      edit_marking_id: 7, is_manuscript: "true",
      marking_erd_date_year: "1849", marking_erd_granularity: "YEAR",
    });
    expect(changedKeys(rows)).toEqual(["manuscript", "shape", "dimensions", "erd"]);
    expect(rows.find((r) => r.key === "erd")?.note).toMatch(/adds this as a recorded date/);
  });
});

describe("compareCoverEdit", () => {
  const cover = {
    type: "FC", is_institutional: true, is_backstamp: false, description: "Folded letter",
    cover_date_year: "1851", cover_date_month: "3", reference_work_ids: [],
  };

  it("shows that an edit without a date clears it, and ignores an empty type", () => {
    const rows = compareCoverEdit(readSubmission(cover).data, readSubmission({ edit_cover_id: "9", type: "", is_backstamp: "true" }).data, []);
    expect(changedKeys(rows)).toEqual(["date", "backstamp"]);
    expect(rows.find((r) => r.key === "date")).toMatchObject({
      proposed: "", note: "This edit has no date, so approval clears it",
    });
  });

  it("finds no change when the form resubmits the same cover", () => {
    const rows = compareCoverEdit(readSubmission(cover).data, readSubmission({
      edit_cover_id: "9", type: "FC", is_institutional: "true", is_backstamp: "false",
      description: "Folded letter", cover_date_year: "1851", cover_date_month: "3",
    }).data, []);
    expect(changedKeys(rows)).toEqual([]);
  });
});
