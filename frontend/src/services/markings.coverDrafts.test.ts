/**
 * Trello T92: the record page lists the signed-in user's own cover drafts for a
 * marking. The fetch used to take the unfiltered first page (10 rows), so a
 * draft older than ten other submissions never showed.
 */
import apiClient from "@/lib/api";
import { getCoverContributionDraftsForMarking } from "@/services/markings";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  // The thumbnail resolver absolutizes media paths against the client's baseURL.
  default: { get: jest.fn(), defaults: { baseURL: "https://woco.test/api/v2" } },
  ensureCsrfToken: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;

const draft = (id: number, parent: number, status = "draft", extra: Record<string, unknown> = {}) => ({
  id,
  status,
  submitted_data: {
    submission_kind: "cover",
    parent_marking_id: parent,
    marking_id: parent,
    type: "FC",
    image_metas: [{ storage_filename: `va/cover-${id}.png`, image_url: `/media/va/cover-${id}.png` }],
    ...extra,
  },
});

describe("getCoverContributionDraftsForMarking", () => {
  beforeEach(() => mockedGet.mockReset());

  it("asks for draft rows at the largest page and keeps only this marking's cover drafts", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        count: 4,
        next: null,
        results: [
          draft(11, 7),
          draft(12, 8),
          draft(13, 7, "pending"),
          { id: 14, status: "draft", submitted_data: { submission_kind: "marking", edit_marking_id: 7 } },
        ],
      },
    });

    const rows = await getCoverContributionDraftsForMarking(7);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0][0]).toBe("/contributions/");
    expect(mockedGet.mock.calls[0][1]).toEqual({
      params: { status: "draft", page_size: 100, ordering: "-created_at" },
    });
    expect(rows.map((r) => r.contributionDraftId)).toEqual([11]);
    expect(rows[0].contributionStatus).toBe("draft");
    expect(rows[0].defaultImageUrl).toContain("cover-11.png");
  });

  it("returns no rows when the list is refused (anonymous or offline)", async () => {
    mockedGet.mockRejectedValueOnce(new Error("401"));
    await expect(getCoverContributionDraftsForMarking(7)).resolves.toEqual([]);
  });
});
