/**
 * Regression tests for the centralized submission-guideline copy.
 * These lock in the specific wording Ian requested (2026-06) and the DRY
 * guarantee that both submission forms render the same shared guidance.
 */
import {
  SHARED_GUIDELINES,
  MARKING_SUBMISSION_GUIDELINES,
  COVER_SUBMISSION_GUIDELINES,
  INSCRIPTION_TEXT_HELP,
  DATE_FORMAT_HELP,
  LETTERING_HELP,
  MARKING_TYPE_GUIDELINE,
} from "./guidelines";

const bodyFor = (list: { label: string; body: string }[], label: string) =>
  list.find((g) => g.label === label)?.body ?? "";

describe("submission guidelines copy", () => {
  it("states the 300 dpi image-quality preference", () => {
    expect(bodyFor(SHARED_GUIDELINES, "Image Quality")).toMatch(/300 dpi/i);
  });

  it("directs submitters to note new references to the editor", () => {
    expect(bodyFor(SHARED_GUIDELINES, "Reference works")).toMatch(
      /note to the editor/i,
    );
  });

  it("explains Ratemark vs. Auxmark on the marking form only", () => {
    const marking = bodyFor(MARKING_SUBMISSION_GUIDELINES, "Ratemark vs. Auxmark");
    // The project's one-word names (docs/devel/vocab.md): a Ratemark states
    // the rate, an Auxmark is any other instructional marking; the rule of
    // thumb and the "add a note" fallback stay.
    expect(marking).toMatch(/Ratemark/);
    expect(marking).toMatch(/Auxmark/);
    expect(marking).toMatch(/rule of thumb/i);
    expect(marking).toMatch(/note for the editor/i);
    expect(marking).not.toMatch(/Rate Mark|town mark|Auxiliary marking/);
    expect(
      COVER_SUBMISSION_GUIDELINES.some((g) => g.label === "Ratemark vs. Auxmark"),
    ).toBe(false);
  });

  it("asks for date verification on the cover form only", () => {
    expect(bodyFor(COVER_SUBMISSION_GUIDELINES, "Date verification")).toMatch(
      /exterior of the cover/i,
    );
    expect(
      MARKING_SUBMISSION_GUIDELINES.some((g) => g.label === "Date verification"),
    ).toBe(false);
  });

  it("makes no promise about review time (T14, Reese 2026-09-24)", () => {
    // Ian never asked for it and volunteers cannot guarantee it.
    expect(SHARED_GUIDELINES.some((g) => /review time/i.test(g.label))).toBe(false);
    expect(SHARED_GUIDELINES.some((g) => /business days/i.test(g.body))).toBe(false);
  });

  it("renders identical shared guidance on both forms (DRY)", () => {
    for (const shared of SHARED_GUIDELINES) {
      expect(MARKING_SUBMISSION_GUIDELINES).toContainEqual(shared);
      expect(COVER_SUBMISSION_GUIDELINES).toContainEqual(shared);
    }
  });
});

describe("field help copy", () => {
  it("tells submitters to enter the exact marking text", () => {
    expect(INSCRIPTION_TEXT_HELP).toMatch(/exact text/i);
  });

  it("explains the date-format codes by example", () => {
    expect(DATE_FORMAT_HELP).toMatch(/MD = Month date only/);
  });

  it("explains the lettering field and its manuscript exception", () => {
    expect(LETTERING_HELP).toMatch(/letter/i);
    expect(LETTERING_HELP).toMatch(/manuscript/i);
  });
});

describe("MARKING_TYPE_GUIDELINE", () => {
  it("uses the project's one-word marking names", () => {
    expect(MARKING_TYPE_GUIDELINE.body).not.toMatch(/Rate Mark|town mark|Auxiliary marking/);
    expect(MARKING_TYPE_GUIDELINE.body).toMatch(/Ratemark/);
    expect(MARKING_TYPE_GUIDELINE.body).toMatch(/Auxmark/);
  });
});
