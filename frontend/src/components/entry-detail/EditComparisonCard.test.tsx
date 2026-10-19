/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { EditComparisonCard } from "./EditComparisonCard";

it("marks changed rows in text and keeps unchanged rows listed", () => {
  render(<EditComparisonCard entryLabel="marking" rows={[
    { key: "color", label: "Color", current: "Black", proposed: "Red", changed: true },
    { key: "town", label: "Town", current: "Richmond", proposed: "Richmond", changed: false },
    { key: "desc", label: "Description", current: "Old", proposed: "", changed: true },
  ]} />);

  expect(screen.getByText(/2 of 3 fields change/)).toBeTruthy();
  const color = screen.getByRole("row", { name: /Color/ });
  expect(within(color).getByText("Changed")).toBeTruthy();
  expect(within(screen.getByRole("row", { name: /Town/ })).queryByText("Changed")).toBeNull();
  // A cleared value reads as a dash, not a blank cell.
  expect(within(screen.getByRole("row", { name: /Description/ })).getByText("—")).toBeTruthy();
});
