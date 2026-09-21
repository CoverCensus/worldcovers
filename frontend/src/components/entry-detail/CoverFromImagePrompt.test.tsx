/**
 * @jest-environment jsdom
 */
/**
 * issues.md 167 / Trello T37 -- the nudge that starts the create-a-cover flow.
 *
 * The classification behind `count` is a guess from pixel dimensions, so the
 * prompt has to stay quiet unless it is reasonably sure. Prompting on the
 * ambiguous middle band is what trains editors to dismiss warnings, which is
 * why "renders nothing" is pinned as hard as "renders something".
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { CoverFromImagePrompt } from "./CoverFromImagePrompt";

describe("CoverFromImagePrompt", () => {
  it("stays silent when nothing looks like a cover", () => {
    const { container } = render(<CoverFromImagePrompt count={0} onCreate={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("offers to create a cover when one image looks like a whole cover", () => {
    render(<CoverFromImagePrompt count={1} onCreate={() => {}} />);

    expect(screen.getByText(/looks like a whole cover/i)).toBeTruthy();
    // Ian's "all is needed is the date" should be visible before the editor
    // commits to anything.
    expect(screen.getByText(/only need the date/i)).toBeTruthy();
  });

  it("counts them when more than one qualifies", () => {
    render(<CoverFromImagePrompt count={3} onCreate={() => {}} />);
    expect(screen.getByText(/3 of these images/i)).toBeTruthy();
  });

  it("starts the flow when the editor accepts", () => {
    const onCreate = jest.fn();
    render(<CoverFromImagePrompt count={1} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: /create a cover/i }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
