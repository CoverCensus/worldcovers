import { capitalizeFirst } from "./utils";

describe("capitalizeFirst", () => {
  it("capitalizes the first letter", () => {
    expect(capitalizeFirst("wordcover")).toBe("Wordcover");
  });

  it("returns empty string when input is empty", () => {
    expect(capitalizeFirst("")).toBe("");
  });
});
