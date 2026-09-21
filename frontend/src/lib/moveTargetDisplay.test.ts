/**
 * issues.md 114 / Trello T38 -- the move-image pickers identified their targets
 * by catalog code alone.
 *
 * Every candidate in the marking picker is a sibling at the SAME post office,
 * so the town never distinguishes them and the code is all the editor gets. At
 * Richmond (post office 11634) that is 147 entries reading `ASCC6-VA-M2110`,
 * `ASCC6-VA-M2147`, `ASCC6-VA-M2560`, in catalog order rather than code order.
 * `Marking.code` is also nullable, so some rows render as `Marking #31153`.
 *
 * Reese hit this hunting `ASCC6-VA-M2110` during the 2026-08-18 C3 rehearsal,
 * and it is the control all ~50 crop-and-move operations for issues.md 104 run
 * through. A mis-targeted move is silent damage to the catalog.
 *
 * T38's acceptance is "find and select both Cover and Marking destinations
 * without knowing a code", which is what the filter and the detail line serve.
 */
import {
  compareMarkingTargets,
  describeCoverTarget,
  describeMarkingTarget,
  filterMoveTargets,
} from "./moveTargetDisplay";
import type { MarkingRecord } from "@/services/markings";
import type { AssociatedCover } from "@/services/markings";

/** Two real Richmond siblings differ by shape and size, not by town. */
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

describe("describeMarkingTarget", () => {
  it("shows identifying detail alongside the code, not the code alone", () => {
    const d = describeMarkingTarget(richmond());

    expect(d.title).toBe("ASCC6-VA-M2110");
    // The defect is "code only", so the detail line is the fix.
    expect(d.detail).toContain("Townmark");
    expect(d.detail).toContain("Circle");
    expect(d.detail).toContain("Black");
    expect(d.thumbnailUrl).toBe("/media/va/richmond-2110.png");
  });

  it("falls back to the record number when the catalog code is null", () => {
    // Marking.code is a nullable column, so this row really does exist.
    const d = describeMarkingTarget(richmond({ id: 31153, code: null as unknown as string }));

    expect(d.title).toBe("Marking #31153");
    expect(d.detail).toContain("Townmark");
  });

  it("separates two same-town siblings that differ only in shape and size", () => {
    // The Richmond problem in one assertion: same town, same inscription,
    // adjacent codes. Only shape and dimensions tell them apart.
    const circle = describeMarkingTarget(richmond());
    const straight = describeMarkingTarget(
      richmond({
        id: 31110,
        code: "ASCC6-VA-M2147",
        shapeName: "Straight Line",
        sizeDisplay: "44x6",
        width: "44",
        height: "6",
      }),
    );

    expect(circle.detail).not.toBe(straight.detail);
    expect(straight.detail).toContain("Straight Line");
  });

  it("omits fields the record does not carry rather than printing placeholders", () => {
    const d = describeMarkingTarget(
      richmond({ shapeName: "", colorName: "", sizeDisplay: null, width: null, height: null }),
    );

    // "-" is the catalog's empty marker; a detail line of "- · - · -" is noise.
    expect(d.detail).not.toContain("-");
    expect(d.detail).toContain("Townmark");
  });
});

describe("filterMoveTargets", () => {
  const targets = [
    describeMarkingTarget(richmond()),
    describeMarkingTarget(
      richmond({ id: 31110, code: "ASCC6-VA-M2147", inscriptionTxt: "PAID", shapeName: "Box" }),
    ),
  ];

  it("finds a target by its inscription, so no code needs to be known", () => {
    // This is T38's acceptance criterion stated directly.
    const hits = filterMoveTargets(targets, "paid");
    expect(hits.map((t) => t.id)).toEqual([31110]);
  });

  it("still finds a target by code for an editor who has one written down", () => {
    expect(filterMoveTargets(targets, "M2110").map((t) => t.id)).toEqual([31108]);
  });

  it("returns everything for an empty query", () => {
    expect(filterMoveTargets(targets, "   ")).toHaveLength(2);
  });
});

describe("compareMarkingTargets", () => {
  it("orders codes numerically so M2110 precedes M2147", () => {
    const sorted = [
      describeMarkingTarget(richmond({ id: 2, code: "ASCC6-VA-M2147" })),
      describeMarkingTarget(richmond({ id: 1, code: "ASCC6-VA-M2110" })),
    ].sort(compareMarkingTargets);

    expect(sorted.map((t) => t.title)).toEqual(["ASCC6-VA-M2110", "ASCC6-VA-M2147"]);
  });

  it("does not sort M10 ahead of M9 the way a plain string compare would", () => {
    const sorted = [
      describeMarkingTarget(richmond({ id: 2, code: "M10" })),
      describeMarkingTarget(richmond({ id: 1, code: "M9" })),
    ].sort(compareMarkingTargets);

    expect(sorted.map((t) => t.title)).toEqual(["M9", "M10"]);
  });

  it("puts codeless records last rather than first", () => {
    const sorted = [
      describeMarkingTarget(richmond({ id: 31153, code: null as unknown as string })),
      describeMarkingTarget(richmond({ id: 1, code: "M9" })),
    ].sort(compareMarkingTargets);

    expect(sorted.map((t) => t.title)).toEqual(["M9", "Marking #31153"]);
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
    expect(describeCoverTarget(cover({ coverDetails: { code: null } })).title).toBe("Cover #42");
  });
});
