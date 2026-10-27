import { readSubmission } from "@/lib/submission";
import { submittedDataToFieldInput } from "./contributionToFields";

const lookups = {
  letteringOptions: [],
  dateFormatOptions: [],
};

describe("submittedDataToFieldInput", () => {
  it("shows submitted Dates Seen at their recorded precision", () => {
    const fields = submittedDataToFieldInput(readSubmission({ marking_dates_seen: [
      { date_year: 1840, granularity: "YEAR", date: "1840-01-01" },
      { date_month: 6, date_day: 12, granularity: "MONTH_DAY", date: null },
    ] }).data, lookups, { contributionId: 56 });
    expect(fields.datesSeen).toBe("1840, JUN 12 (year unknown)");
  });
  it("accepts the T70 county keys and maps the county name", () => {
    const fields = submittedDataToFieldInput(
      readSubmission({ state: "Virginia", town: "Onancock", county: "Accomack", county_id: "9", county_proposed: "" }).data,
      lookups,
      { contributionId: 56 },
    );
    expect(fields.county).toBe("Accomack");
  });
  it("accepts pending marking ERD/LRD keys and formats them by precision", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        marking_erd: "1845-01-01",
        marking_erd_granularity: "YEAR",
        marking_lrd: "1850-12-31",
        marking_lrd_granularity: "DAY",
      }).data,
      lookups,
      { contributionId: 56 },
    );

    expect(fieldInput.earliestSeen).toBe("1845");
    expect(fieldInput.latestSeen).toBe("12/31/1850");
  });

  it("falls back to marking ERD/LRD when legacy seen fields are empty", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        first_seen: "",
        last_seen: "",
        marking_erd: "1845-01-01",
        marking_lrd: "1850-12-31",
      }).data,
      lookups,
      { contributionId: 56 },
    );

    expect(fieldInput.earliestSeen).toBe("01/01/1845");
    expect(fieldInput.latestSeen).toBe("12/31/1850");
  });

  it("formats marking ERD/LRD component dates without a year", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        marking_erd_date_month: "12",
        marking_erd_date_day: "1",
        marking_lrd_date_year: "1850",
        marking_lrd_date_day: "14",
      }).data,
      lookups,
      { contributionId: 56 },
    );

    expect(fieldInput.earliestSeen).toBe("DEC 1 (year unknown)");
    expect(fieldInput.latestSeen).toBe("Day 14, 1850 (month unknown)");
  });

  it("formats explicit unknown marking ERD/LRD flags", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        marking_erd_unknown: true,
        marking_lrd_unknown: true,
      }).data,
      lookups,
      { contributionId: 56 },
    );

    expect(fieldInput.earliestSeen).toBe("Date unknown");
    expect(fieldInput.latestSeen).toBe("Date unknown");
  });

  it("preserves manuscript and irregular flags from string form payloads", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        is_manuscript: "true",
        is_irreg: "false",
      }).data,
      lookups,
      { contributionId: 57 },
    );

    expect(fieldInput.isManuscript).toBe(true);
    expect(fieldInput.isIrreg).toBe(false);
  });

  it("preserves manuscript and irregular flags from camelCase payloads", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submissionKind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        isManuscript: true,
        isIrreg: true,
      }).data,
      lookups,
      { contributionId: 58 },
    );

    expect(fieldInput.isManuscript).toBe(true);
    expect(fieldInput.isIrreg).toBe(true);
  });

  it("accepts attribution opt-in metadata without rendering it as a field", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        state: "VA",
        town: "Richmond",
        type: "TOWNMARK",
        display_submitter_name: true,
        displaySubmitterName: true,
        no_marking_image: true,
        noMarkingImage: true,
      }).data,
      lookups,
      { contributionId: 38 },
    );

    expect(fieldInput.state).toBe("VA");
    expect(fieldInput.town).toBe("Richmond");
  });

  // The VPHC ingest (apply_vphc_ledger) is the source of every pending
  // submission in the review queue, so its payload shape is the one that
  // matters most for the adapter's allowlist.
  it("renders a VPHC ingest payload without tripping the allowlist", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        submission_kind: "marking",
        type: "TOWNMARK",
        state: "VA",
        town: "Abingdon",
        inscription_txt: "ABINGDON Va.",
        is_manuscript: false,
        is_irreg: false,
        desc: "Virginia Postal History Catalog Abingdon #5 (T1:r8).",
        reference_work_ids: [3],
        reference_work_details: [{ reference_work_id: 3, page_number: "5" }],
        contributor_comment: "",
        vphc: {
          src: "T1:r8",
          flags: ["date_low_confidence"],
          state: "VA",
          county: "WASHINGTON",
          cancel_no: "5",
          vphc_code: "VPHC-VA-ABINGDON-5",
          rules_version: 2,
          why_unmatched: "ambiguous",
        },
      }).data,
      lookups,
      { contributionId: 4173 },
    );

    expect(fieldInput.town).toBe("Abingdon");
    expect(fieldInput.state).toBe("VA");
    expect(fieldInput.catalogTxt).toContain("Virginia Postal History Catalog");
  });

  it("displays the bare lettering name a VPHC edit submission carries", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({ edit_marking_id: 91, lettering: "Serif" }).data,
      lookups,
      { contributionId: 4173 },
    );

    expect(fieldInput.letteringName).toBe("Serif");
  });

  // apply_vphc_ledger writes lettering: null when the edited marking has no
  // lettering, which must read as "absent" rather than the string "null".
  it("treats a null lettering as no lettering", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({ edit_marking_id: 91, lettering: null }).data,
      lookups,
      { contributionId: 4173 },
    );

    expect(fieldInput.letteringName).toBe("");
  });

  it("keeps known fields readable and reports an unknown key at the boundary", () => {
    const parsed = readSubmission({ town: "Richmond", some_new_field: "x" });
    expect(parsed.unsupported).toEqual(["Submission.some_new_field"]);
    expect(submittedDataToFieldInput(parsed.data, lookups, { contributionId: 99 }).town).toBe("Richmond");
  });

  it("does not display ARC semi-circle dimensions as a diameter", () => {
    const fieldInput = submittedDataToFieldInput(
      readSubmission({
        shape: "ARC - Arc or Semi-circle",
        width_mm: "32",
        height_mm: "19",
      }).data,
      lookups,
      { contributionId: 57 },
    );

    expect(fieldInput.dimensions).toBe("32x19 mm");
  });
});
