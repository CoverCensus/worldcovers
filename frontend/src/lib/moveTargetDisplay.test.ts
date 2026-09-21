/**
 * issues.md 114 / Trello T38 -- identifying a move destination by sight.
 *
 * The cover picker used to render a bare catalog code and nothing else, so an
 * editor chose a destination from a string they could not verify. Rows now
 * carry a thumbnail and an identifying line, and the list is filterable, which
 * is T38's "find and select ... without knowing a code".
 *
 * ⚠ The MARKING screen's picker was removed on 2026-09-21 (Ian asked twice).
 * `describeMarkingTarget` now serves the COVER screen's "Move Image to
 * Marking" picker, which had the identical code-only defect and had simply not
 * been reported yet -- `CoverDetail.tsx` rendered a bare
 * `marking.code ?? \`Marking #${id}\`` in a Radix Select.
 */
import {
  compareMarkingTargets,
  describeCoverTarget,
  describeMarkingTarget,
  filterMoveTargets,
  type MoveTargetDescription,
} from "./moveTargetDisplay";
import type { AssociatedCover, MarkingRecord } from "@/services/markings";

/** Build a description directly: no producer function takes markings any more. */
const target = (id: number, title: string, detail: string): MoveTargetDescription => ({
  id,
  title,
  detail,
  thumbnailUrl: null,
  searchText: `${title} ${detail}`.toLowerCase(),
});

const cover = (over: Record<string, unknown> = {}): AssociatedCover =>
  ({
    id: 900,
    reviewStatus: "approved",
    defaultImageUrl: "/media/va/cover-42.png",
    coverDetails: {
      id: 42,
      code: "C-42",
      type: "FL",
      colorName: "Buff",
      width: "120",
      height: "75",
      datesSeen: [{ id: 1, date: "1847-08-03", granularity: "DAY" }],
      ...((over.coverDetails as Record<string, unknown>) ?? {}),
    },
  }) as unknown as AssociatedCover;

/** Two real siblings differ by shape and size, not by town. */
const richmond = (over: Partial<MarkingRecord> = {}): MarkingRecord =>
  ({
    id: 31108,
    code: "ASCC6-VA-M2110",
    type: "TOWNMARK",
    inscriptionTxt: "RICHM'D/VA",
    postOfficeName: "Richmond",
    stateAbbrev: "VA",
    shapeName: "Circle",
    colorName: "Black",
    sizeDisplay: "28x28",
    width: "28",
    height: "28",
    isManuscript: false,
    mainImage: { imageUrl: "/media/va/richmond-2110.png" },
    ...over,
  }) as unknown as MarkingRecord;

describe("describeMarkingTarget", () => {
  it("shows identifying detail alongside the code, not the code alone", () => {
    const d = describeMarkingTarget(richmond());

    expect(d.title).toBe("ASCC6-VA-M2110");
    expect(d.detail).toContain("Townmark");
    expect(d.detail).toContain("Circle");
    expect(d.detail).toContain("Black");
  });

  it("falls back to the record number when the catalog code is null", () => {
    // Marking.code is nullable, and on woco.dev every sampled row at post
    // office 19104 had no code at all -- they were indistinguishable before.
    const d = describeMarkingTarget(richmond({ id: 31153, code: null as unknown as string }));
    expect(d.title).toBe("Marking #31153");
  });

  it("separates two siblings that differ only in shape and size", () => {
    const circle = describeMarkingTarget(richmond());
    const straight = describeMarkingTarget(
      richmond({ shapeName: "Straight Line", sizeDisplay: "44x6", width: "44", height: "6" }),
    );

    expect(circle.detail).not.toBe(straight.detail);
    expect(straight.detail).toContain("Straight Line");
  });

  it("prefers the caller's thumbnail when it has a better one", () => {
    // The cover screen already loads a default thumbnail per linked marking.
    const d = describeMarkingTarget(richmond(), "/media/va/from-cover.png");
    expect(d.thumbnailUrl).toBe("/media/va/from-cover.png");
  });
});

describe("describeCoverTarget", () => {
  it("shows the cover's code, type and observed date", () => {
    const d = describeCoverTarget(cover());

    expect(d.title).toBe("C-42");
    expect(d.detail).toContain("Folded Letter");
    expect(d.detail).toContain("1847");
    expect(d.thumbnailUrl).toBe("/media/va/cover-42.png");
  });

  it("falls back to the record number when the cover has no code", () => {
    // Cover.code is nullable, so this row really does exist.
    expect(describeCoverTarget(cover({ coverDetails: { code: null } })).title).toBe("Cover #42");
  });

  it("omits fields the record does not carry rather than printing placeholders", () => {
    const d = describeCoverTarget(
      cover({ coverDetails: { type: null, colorName: "", width: null, height: null, datesSeen: [] } }),
    );

    // "-" is the catalog's empty marker; a detail line of "- · - · -" is noise.
    expect(d.detail).not.toContain("-");
  });
});

describe("filterMoveTargets", () => {
  const targets = [
    target(42, "C-42", "Folded Letter · Buff · AUG 3, 1847"),
    target(43, "C-43", "Folded Cover · Blue · 1851"),
  ];

  it("finds a target by its detail, so no code needs to be known", () => {
    // T38's acceptance criterion stated directly.
    expect(filterMoveTargets(targets, "blue").map((t) => t.id)).toEqual([43]);
  });

  it("still finds a target by code for an editor who has one written down", () => {
    expect(filterMoveTargets(targets, "C-42").map((t) => t.id)).toEqual([42]);
  });

  it("returns everything for an empty query", () => {
    expect(filterMoveTargets(targets, "   ")).toHaveLength(2);
  });
});

describe("compareMarkingTargets", () => {
  it("does not sort C-10 ahead of C-9 the way a plain string compare would", () => {
    const sorted = [target(2, "C-10", ""), target(1, "C-9", "")].sort(compareMarkingTargets);
    expect(sorted.map((t) => t.title)).toEqual(["C-9", "C-10"]);
  });

  it("puts codeless records last rather than first", () => {
    const sorted = [target(42, "Cover #42", ""), target(1, "C-9", "")].sort(compareMarkingTargets);
    expect(sorted.map((t) => t.title)).toEqual(["C-9", "Cover #42"]);
  });
});
