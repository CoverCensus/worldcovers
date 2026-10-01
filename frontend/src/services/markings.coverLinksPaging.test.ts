import apiClient from "@/lib/api";
import { getCoverMarkingsByCover } from "@/services/markings";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;

describe("getCoverMarkingsByCover", () => {
  beforeEach(() => mockedGet.mockReset());

  it("loads every page of existing associations", async () => {
    mockedGet
      .mockResolvedValueOnce({ data: { next: "/cover-markings/?cover=7&page=2", results: [
        { id: 1, cover: 7, marking: 11, review_status: "approved" },
      ] } })
      .mockResolvedValueOnce({ data: { next: null, results: [
        { id: 2, cover: 7, marking: 22, review_status: "pending" },
      ] } });
    const result = await getCoverMarkingsByCover(7);
    expect(result.error).toBeNull();
    expect(result.links.map((link) => link.markingId)).toEqual([11, 22]);
    expect(mockedGet.mock.calls[0][1]).toEqual({ params: { cover: "7", page_size: "100" } });
    expect(mockedGet.mock.calls[1][0]).toContain("page=2");
  });

  it("does not return a partial list after a later page fails", async () => {
    mockedGet
      .mockResolvedValueOnce({ data: { next: "/cover-markings/?cover=7&page=2", results: [
        { id: 1, cover: 7, marking: 11, review_status: "approved" },
      ] } })
      .mockRejectedValueOnce(new Error("read failed"));
    const result = await getCoverMarkingsByCover(7);
    expect(result.links).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});
