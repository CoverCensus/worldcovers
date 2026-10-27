/**
 * Issue #109 -- the editor queue's filters must be SENT, not applied to the
 * page the browser is already holding.
 *
 * Dashboard.tsx filtered `editorHistoryItems`, which is one server page. At
 * 2,440 queued contributions that meant searching "farm" returned nothing on
 * page 1 of 25 while Farmville sat on page 16 -- and a lookup that finds
 * nothing reads as "the record isn't there", not as a broken filter.
 *
 * So these tests assert on the request, not on the response: every filter has
 * to appear in the query params, or the queue is page-local again the moment
 * someone adds a caller.
 */
import { listContributions, listMyContributions } from "./contributions";
import apiClient from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;

const page = (results: unknown[] = []) => ({
  data: { count: results.length, next: null, previous: null, results },
});

describe("listMyContributions", () => {
  beforeEach(() => mockedGet.mockReset());

  it("requests enough rows to show all 17 drafts", async () => {
    const drafts = Array.from({ length: 17 }, (_, i) => ({ id: i + 1, status: "draft" }));
    mockedGet.mockResolvedValueOnce({ data: { count: 17, results: drafts } });

    const result = await listMyContributions();

    expect(result.items.map((item) => item.id)).toEqual(drafts.map((item) => item.id));
    expect(result.incomplete).toBe(false);
    expect(mockedGet.mock.calls.map((call) => call[1].params)).toEqual([
      { page: 1, page_size: 100 },
    ]);
  });

  it("loads later pages when a user has more than 100 submissions", async () => {
    const drafts = Array.from({ length: 117 }, (_, i) => ({ id: i + 1, status: "draft" }));
    mockedGet
      .mockResolvedValueOnce({ data: { count: 117, next: "?page=2", results: drafts.slice(0, 100) } })
      .mockResolvedValueOnce({ data: { count: 117, next: null, results: drafts.slice(100) } });

    const result = await listMyContributions();

    expect(result.items.map((item) => item.id)).toEqual(drafts.map((item) => item.id));
    expect(result.incomplete).toBe(false);
    expect(mockedGet.mock.calls.map((call) => call[1].params)).toEqual([
      { page: 1, page_size: 100 },
      { page: 2, page_size: 100 },
    ]);
  });

  it("does not request an invalid page when the server has no next page", async () => {
    const drafts = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: "draft" }));
    mockedGet.mockResolvedValueOnce({ data: { count: 17, next: null, results: drafts } });

    const result = await listMyContributions();

    expect(result.items.map(({ id, status }) => ({ id, status }))).toEqual(drafts);
    expect(result.incomplete).toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded submissions if a later page becomes invalid", async () => {
    const drafts = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: "draft" }));
    mockedGet
      .mockResolvedValueOnce({ data: { count: 117, next: "?page=2", results: drafts } })
      .mockRejectedValueOnce(new Error("Invalid page."));

    const result = await listMyContributions();

    expect(result.items.map(({ id, status }) => ({ id, status }))).toEqual(drafts);
    expect(result.incomplete).toBe(true);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

const paramsOfLastCall = () => mockedGet.mock.calls[0][1].params;

describe("listContributions query params", () => {
  it("returns normalized Submission data, baselines, and list display fields", async () => {
    mockedGet.mockResolvedValueOnce(page([{
      id: 4339, status: "pending", display_name: "Burlington Marking",
      state_display: "Vermont", town_display: "Burlington",
      main_image: { image_url: "/media/marking.png" },
      submitted_data: { desc: "Current text", isManuscript: "false", pendingCover: { type: "ENV" } },
      edit_baseline: { desc: "Old text", is_manuscript: false, future_field: "Not yet supported" },
    }]));
    const result = await listContributions();
    expect(result.items[0]).toMatchObject({
      displayName: "Burlington Marking", stateDisplay: "Vermont", townDisplay: "Burlington",
      imageUrl: "/media/marking.png", description: "Current text",
      submittedData: { description: "Current text", is_manuscript: false, pending_cover: { type: "ENV" } },
      editBaseline: { description: "Old text", is_manuscript: false },
      unsupportedSubmissionFields: ["Submission.future_field"],
    });
    expect(result).not.toHaveProperty("rawItems");
  });

  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue(page());
  });

  it("sends the search text as ?q=", async () => {
    await listContributions({ mode: "editor", q: "farm" });

    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toBe("/contributions/");
    expect(config.params.q).toBe("farm");
  });

  it("sends town, shape, colour and the date range", async () => {
    await listContributions({
      mode: "editor",
      town: "Farmville",
      shape: "C - Circle",
      color: "RED",
      submittedFrom: "2026-07-01",
      submittedTo: "2026-08-12",
    });

    expect(paramsOfLastCall()).toMatchObject({
      town: "Farmville",
      shape: "C - Circle",
      color: "RED",
      submitted_from: "2026-07-01",
      submitted_to: "2026-08-12",
    });
  });

  it("omits blank filters and the 'all' sentinel", async () => {
    await listContributions({
      mode: "editor",
      q: "",
      town: "   ",
      shape: "all",
      color: "all",
      submittedFrom: "",
      submittedTo: "",
    });

    const params = paramsOfLastCall();
    for (const key of ["q", "town", "shape", "color", "submitted_from", "submitted_to"]) {
      expect(params).not.toHaveProperty(key);
    }
    expect(params.mode).toBe("editor");
  });

  it("trims whitespace off q and town", async () => {
    await listContributions({ q: "  farm  ", town: "  Farmville  " });

    expect(paramsOfLastCall()).toMatchObject({ q: "farm", town: "Farmville" });
  });

  it("sends the ordering it is given", async () => {
    await listContributions({ mode: "editor", ordering: "town,id" });

    expect(paramsOfLastCall().ordering).toBe("town,id");
  });

  it("still sends the params it always did", async () => {
    await listContributions({ mode: "editor", status: "pending", state: "VA", page: 3, pageSize: 100 });

    expect(paramsOfLastCall()).toMatchObject({
      mode: "editor",
      status: "pending",
      state: "VA",
      page: 3,
      page_size: 100,
    });
  });
});
