/**
 * Cover type vocabulary (Trello T67; Ian's 2026-09-23 "Cover Options" thread).
 *
 * Two codes (FC, FL) grew to six. Every screen used to carry its own FC/FL
 * ternary, and the edit form quietly turned any other stored value into FL.
 */
import {
  COVER_TYPE_OPTIONS,
  DEFAULT_COVER_TYPE,
  coverTypeLabel,
  isCoverTypeCode,
  normalizeCoverType,
} from "./coverTypes";

describe("coverTypes", () => {
  it("offers every option Ian and the editors asked for, legacy FC included", () => {
    expect(COVER_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "FL", "FLF", "ENV", "ENVF", "FC", "UNK",
    ]);
    expect(COVER_TYPE_OPTIONS.find((o) => o.value === "ENV")?.label).toBe("ENV - Envelope");
  });

  it("labels every code, and falls back to the raw code for an unknown one", () => {
    expect(coverTypeLabel("FL")).toBe("Folded Letter");
    expect(coverTypeLabel("FLF")).toBe("Folded Letter Front");
    expect(coverTypeLabel("ENV")).toBe("Envelope");
    expect(coverTypeLabel("ENVF")).toBe("Envelope Front");
    expect(coverTypeLabel("FC")).toBe("Folded Cover");
    expect(coverTypeLabel("UNK")).toBe("Unknown");
    expect(coverTypeLabel("fl")).toBe("Folded Letter");
    expect(coverTypeLabel("ZZ")).toBe("ZZ");
    expect(coverTypeLabel(null)).toBe("");
    expect(coverTypeLabel("")).toBe("");
  });

  it("recognises codes case-insensitively and rejects everything else", () => {
    expect(isCoverTypeCode("envf")).toBe(true);
    expect(isCoverTypeCode("FC")).toBe(true);
    expect(isCoverTypeCode("TOWNMARK")).toBe(false);
    expect(isCoverTypeCode("")).toBe(false);
    expect(isCoverTypeCode(null)).toBe(false);
  });

  it("defaults a blank form to Unknown and keeps a stored code as it is", () => {
    expect(DEFAULT_COVER_TYPE).toBe("UNK");
    expect(normalizeCoverType("ENVF")).toBe("ENVF");
    expect(normalizeCoverType(" fl ")).toBe("FL");
    // Before: anything unrecognised became FL, a claim nobody made.
    expect(normalizeCoverType("ZZ")).toBe("UNK");
    expect(normalizeCoverType(null)).toBe("UNK");
  });
});
