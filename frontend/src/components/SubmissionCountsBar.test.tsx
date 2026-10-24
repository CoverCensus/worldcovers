/**
 * @jest-environment jsdom
 */
// Trello T96 -- counts at the top of the Dashboard, each a link into the filtered list.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SubmissionCountsBar } from "./SubmissionCountsBar";

function renderBar(props: Partial<React.ComponentProps<typeof SubmissionCountsBar>> = {}) {
  const onSelect = jest.fn();
  render(
    <MemoryRouter>
      <SubmissionCountsBar
        counts={{ needsRevision: 8, drafts: 0, pending: 3 }}
        isEditor={false}
        onSelect={onSelect}
        {...props}
      />
    </MemoryRouter>,
  );
  return onSelect;
}

describe("SubmissionCountsBar", () => {
  it("shows each count as a link to the filtered dashboard, with zero rendered as 0", () => {
    renderBar();
    const revision = screen.getByRole("link", { name: "8 submissions needing revision" });
    expect(revision.getAttribute("href")).toBe("/dashboard?status=needs_revision");
    expect(revision.textContent).toContain("8");
    const drafts = screen.getByRole("link", { name: "0 drafts" });
    expect(drafts.getAttribute("href")).toBe("/dashboard?status=draft");
    expect(drafts.textContent).toContain("0");
    expect(screen.getByRole("link", { name: "3 pending submissions" }).getAttribute("href")).toBe(
      "/dashboard?status=pending",
    );
    expect(screen.queryByText("To review")).toBeNull();
  });

  it("adds the review-queue tile for Editors and reports loading until the count arrives", () => {
    renderBar({ isEditor: true, editorLoading: true });
    screen.getByRole("link", { name: "To review: loading" });
    screen.getByLabelText("Loading");
  });

  it("tells the page which view was chosen when a tile is clicked", () => {
    const onSelect = renderBar({ isEditor: true, editorPending: 12 });
    const review = screen.getByRole("link", { name: "12 submissions to review" });
    expect(review.getAttribute("href")).toBe("/dashboard?tab=editor&e_status=pending");
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("link", { name: "0 drafts" }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["editor_pending", "draft"]);
  });
});
