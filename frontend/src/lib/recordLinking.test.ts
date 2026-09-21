import { parseMarkingIdInput } from "./recordLinking";

describe("parseMarkingIdInput", () => {
  it("accepts bare ids and api- route ids", () => {
    expect(parseMarkingIdInput("12")).toBe(12);
    expect(parseMarkingIdInput("api-12")).toBe(12);
  });

  it("rejects non-linkable input", () => {
    expect(parseMarkingIdInput("")).toBeNull();
    expect(parseMarkingIdInput("api-")).toBeNull();
    expect(parseMarkingIdInput("marking")).toBeNull();
  });
});
