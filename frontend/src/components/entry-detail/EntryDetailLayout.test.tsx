/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/components/Navigation", () => ({
  Navigation: () => <nav>Navigation</nav>,
}));
jest.mock("@/components/Footer", () => ({
  Footer: () => <footer>Footer</footer>,
}));

import { EntryDetailLayout } from "./EntryDetailLayout";

describe("EntryDetailLayout", () => {
  it("places a large page title beside the Back button", () => {
    const onBack = jest.fn();
    render(
      <EntryDetailLayout
        onBack={onBack}
        title="Cover"
        leftColumn={<div>Left</div>}
        rightColumn={<div>Right</div>}
      />,
    );

    const back = screen.getByRole("button", { name: "Back" });
    const title = screen.getByRole("heading", { name: "Cover", level: 1 });
    expect(title.className).toContain("text-[2.35rem]");
    expect(back.parentElement).toBe(title.parentElement);
    expect(title.parentElement?.className).toContain("flex-col");
    expect(title.parentElement?.className).toContain("gap-1");
    expect(title.className).not.toContain("-mt-1");

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
