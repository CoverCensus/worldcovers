/**
 * @jest-environment jsdom
 *
 * sessionStorage-backed, so it needs the DOM environment (jest defaults to
 * node; see catalogParams.test.ts).
 */
import {
  hasPageAfter,
  neighboursOf,
  readCatalogQuery,
  rememberCatalogQuery,
  rememberCatalogRow,
  searchWithPage,
  takeCatalogRow,
} from "./catalogCursor";

beforeEach(() => sessionStorage.clear());

describe("catalog query", () => {
  it("round-trips the query the catalog ran, without the leading ?", () => {
    rememberCatalogQuery({ search: "?state=TX&page=3", page: 3, pageSize: 25, options: { state: "TX", ordering: "id" } });
    expect(readCatalogQuery()).toEqual({ search: "state=TX&page=3", page: 3, pageSize: 25, options: { state: "TX", ordering: "id" } });
  });

  it("returns null when nothing is remembered or the record is malformed", () => {
    expect(readCatalogQuery()).toBeNull();
    sessionStorage.setItem("worldcovers.catalog.lastQuery", JSON.stringify({ search: "x", page: 0, pageSize: 25, options: {} }));
    expect(readCatalogQuery()).toBeNull();
    sessionStorage.setItem("worldcovers.catalog.lastQuery", "not json");
    expect(readCatalogQuery()).toBeNull();
  });

  it("survives storage that throws", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberCatalogQuery({ search: "", page: 1, pageSize: 25, options: {} })).not.toThrow();
    setItem.mockRestore();
  });
});

describe("catalog row", () => {
  it("gives the row back once for the same view, then forgets it", () => {
    rememberCatalogRow("state=TX&page=2", 412);
    expect(takeCatalogRow("?state=TX&page=2")).toBe(412);
    expect(takeCatalogRow("state=TX&page=2")).toBeNull();
  });

  it("ignores a row remembered for a different view", () => {
    rememberCatalogRow("state=TX", 412);
    expect(takeCatalogRow("state=VA")).toBeNull();
  });
});

describe("searchWithPage", () => {
  it("sets, replaces and omits the page param the way the catalog writes it", () => {
    expect(searchWithPage("state=TX", 2)).toBe("state=TX&page=2");
    expect(searchWithPage("state=TX&page=2", 3)).toBe("state=TX&page=3");
    expect(searchWithPage("state=TX&page=2", 1)).toBe("state=TX");
  });
});

describe("neighboursOf", () => {
  const rows = [{ id: 10 }, { id: 11 }, { id: 12 }];

  it("finds both neighbours in the middle of a page", () => {
    expect(neighboursOf(rows, 11)).toEqual({ index: 1, prev: 10, next: 12 });
  });

  it("has no previous at the first row and no next at the last", () => {
    expect(neighboursOf(rows, 10)).toEqual({ index: 0, prev: null, next: 11 });
    expect(neighboursOf(rows, 12)).toEqual({ index: 2, prev: 11, next: null });
  });

  it("is null when the row is not on the page", () => {
    expect(neighboursOf(rows, 99)).toBeNull();
    expect(neighboursOf([], 10)).toBeNull();
  });
});

describe("hasPageAfter", () => {
  it("uses the count when known, else the server's next link", () => {
    expect(hasPageAfter(1, 25, 26, null)).toBe(true);
    expect(hasPageAfter(2, 25, 50, "ignored")).toBe(false);
    expect(hasPageAfter(1, 25, null, "/markings/?page=2")).toBe(true);
    expect(hasPageAfter(1, 25, null, null)).toBe(false);
  });
});
