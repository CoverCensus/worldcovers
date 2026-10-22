// Trello S19 -- first author plus "et al." without splitting one person's name.
import { compactReferenceWorkLine, firstAuthor, formatAuthorsCompact } from "./referenceWorkDisplay";

describe("firstAuthor", () => {
  it("keeps a single comma-containing name whole", () => {
    expect(firstAuthor("Briggs, Deane R.")).toEqual({ name: "Briggs, Deane R.", etAl: false });
  });

  it("splits on semicolons", () => {
    expect(firstAuthor("Deane R. Briggs; Francis Ferguson; Thomas M. Lera")).toEqual({
      name: "Deane R. Briggs",
      etAl: true,
    });
  });

  it("splits on 'and' and '&' between names, but not inside a word", () => {
    expect(firstAuthor("Ann Smith and Bob Jones")).toEqual({ name: "Ann Smith", etAl: true });
    expect(firstAuthor("Ann Smith & Bob Jones")).toEqual({ name: "Ann Smith", etAl: true });
    expect(firstAuthor("Anderson")).toEqual({ name: "Anderson", etAl: false });
  });

  it("never splits on a comma, so a comma-listed trio keeps its first two names", () => {
    expect(firstAuthor("Deane R. Briggs, Francis Ferguson and Thomas M. Lera")).toEqual({
      name: "Deane R. Briggs, Francis Ferguson",
      etAl: true,
    });
  });

  it("handles blanks", () => {
    expect(firstAuthor("")).toEqual({ name: "", etAl: false });
    expect(firstAuthor(null)).toEqual({ name: "", etAl: false });
    expect(formatAuthorsCompact("  ")).toBe("");
  });
});

describe("compactReferenceWorkLine", () => {
  it("joins authors, edition, volume and year, leaving blanks out", () => {
    expect(
      compactReferenceWorkLine({ authorship: "A; B", edition: "2", volume: "3", publicationYear: 2021 }),
    ).toBe("A et al. | 2nd Ed. | Vol. 3 | 2021");
    expect(
      compactReferenceWorkLine({ authorship: "Solo", edition: "Revised", volume: "", publicationYear: null }),
    ).toBe("Solo | Revised Ed.");
    expect(compactReferenceWorkLine({ authorship: "", edition: "", volume: "", publicationYear: 1997 })).toBe("1997");
  });
});
