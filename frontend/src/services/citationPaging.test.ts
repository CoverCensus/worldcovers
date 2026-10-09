import apiClient from "@/lib/api";
import { getReferenceWorks } from "./referenceWorks";
import { listCitationsForSubject } from "./citations";

jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = apiClient.get as jest.Mock;
beforeEach(() => get.mockReset());

it("loads every Reference Work page", async () => {
  get.mockResolvedValueOnce({ data: { results: [{ id: 1 }], next: "/reference-works/?page=2" } })
    .mockResolvedValueOnce({ data: { results: [{ id: 2 }], next: null } });
  expect((await getReferenceWorks()).map((work) => work.id)).toEqual([1, 2]);
  expect(get.mock.calls[1][0]).toBe("/reference-works/?page=2");
});

it("rejects Reference Works without the API id field", async () => {
  get.mockResolvedValueOnce({ data: { results: [{ reference_work_id: 1 }], next: null } });
  await expect(getReferenceWorks()).rejects.toThrow("invalid id");
});

it("normalizes empty optional Reference Work fields for the Citation cards", async () => {
  get.mockResolvedValueOnce({ data: { results: [{
    id: 3, title: "Virginia Postal History Catalog", edition: null,
    volume: null, isbn: null, url: null,
  }], next: null } });
  const [work] = await getReferenceWorks();
  expect(work).toMatchObject({ id: 3, edition: "", volume: "", isbn: "", url: "" });
});

it("loads every Citation page for the Entry", async () => {
  const row = (id: number) => ({ id, reference_work: id, subject_id: 7, subject_type: "COVER" });
  get.mockResolvedValueOnce({ data: { results: [row(1)], next: "/citations/?page=2" } })
    .mockResolvedValueOnce({ data: { results: [row(2)], next: null } });
  const rows = await listCitationsForSubject({ subjectType: "COVER", subjectId: 7 });
  expect(rows.map((item) => item.referenceWorkId)).toEqual([1, 2]);
  expect(get.mock.calls[1][1].params).toEqual({ subject_type: "COVER", subject_id: 7 });
});

it.each([getReferenceWorks, () => listCitationsForSubject({ subjectType: "COVER", subjectId: 7 })])(
  "does not report a failed Citation lookup as an empty selection",
  async (load) => {
    get.mockRejectedValueOnce(new Error("Network error"));
    await expect(load()).rejects.toThrow("Network error");
    get.mockResolvedValueOnce({ data: {} });
    await expect(load()).rejects.toThrow("missing results array");
  },
);
