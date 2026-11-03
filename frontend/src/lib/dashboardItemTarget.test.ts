import { dashboardItemTarget } from "@/lib/dashboardItemTarget";
import { readReturnTo } from "@/lib/returnTo";

// Trello T97: the image button, the title link and the status badge of a
// Dashboard row must open the same place, so the one function that decides
// it is tested here rather than through the page.
const FROM = "/dashboard?tab=submissions&status=pending&page_size=50";
const RETURN_STATE = { fromDashboard: true, dashboardTab: "submissions" };

describe("dashboardItemTarget", () => {
  it("opens a pending submission's review page with the return-to query", () => {
    const target = dashboardItemTarget({ id: 7, status: "pending" }, FROM, RETURN_STATE);

    expect(target.to.startsWith("/contribution/7?")).toBe(true);
    expect(readReturnTo(new URLSearchParams(target.to.split("?")[1]))).toBe(FROM);
    expect(target.state).toEqual(RETURN_STATE);
  });

  it("resumes a cover draft in CoverEdit under its parent marking", () => {
    const target = dashboardItemTarget(
      { id: 7, status: "draft", isCover: true, cover_parent_marking_id: 12 },
      FROM,
      RETURN_STATE,
    );

    expect(target).toEqual({ to: "/record/12/cover/new?edit=7", state: { from: FROM } });
  });

  it("resumes any other draft in the Contribute form", () => {
    const marking = dashboardItemTarget({ id: 7, status: "Draft" }, FROM, RETURN_STATE);
    const orphanCover = dashboardItemTarget(
      { id: 8, status: "draft", isCover: true, cover_parent_marking_id: null },
      FROM,
      RETURN_STATE,
    );

    expect(marking).toEqual({ to: "/contribute?edit=7", state: { from: FROM } });
    expect(orphanCover.to).toBe("/contribute?edit=8");
  });
});
