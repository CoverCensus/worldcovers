/**
 * issues.md 174 — getMarkingCovers fetched one page at the API default of 10,
 * so a marking with more covers showed and counted only the first ten.
 */
import apiClient from "@/lib/api";
import { getMarkingCovers } from "@/services/markings";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;

const row = (id: number) => ({
  id,
  review_status: "approved",
  is_backstamp: false,
  cover_details: { id: id * 10, code: `C-${id}`, dates_seen: [] },
});

describe("getMarkingCovers paging", () => {
  beforeEach(() => mockedGet.mockReset());

  it("asks for the largest page and follows `next` until the list is complete", async () => {
    mockedGet
      .mockResolvedValueOnce({
        data: { count: 3, next: "https://woco.test/api/v2/cover-markings/?marking=5&page=2&page_size=100", results: [row(1), row(2)] },
      })
      .mockResolvedValueOnce({ data: { count: 3, next: null, results: [row(3)] } });

    const { covers, error } = await getMarkingCovers(5);

    expect(error).toBeNull();
    expect(covers.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet.mock.calls[0][0]).toBe("/cover-markings/");
    expect(mockedGet.mock.calls[0][1]).toEqual({ params: { marking: "5", page_size: "100" } });
    expect(mockedGet.mock.calls[1][0]).toContain("page=2");
  });

  it("returns what it has with an error message when a page fails", async () => {
    mockedGet.mockRejectedValueOnce({ response: { data: { detail: "boom" } } });
    const { covers, error } = await getMarkingCovers(5);
    expect(covers).toEqual([]);
    expect(error).toBe("boom");
  });
});
