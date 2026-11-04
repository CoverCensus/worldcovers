/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { CatalogNeighbourNav } from "./CatalogNeighbourNav";

it("renders nothing without list context", () => {
  const { container } = render(<CatalogNeighbourNav neighbours={null} onStep={jest.fn()} />);
  expect(container.firstChild).toBeNull();
});

it("steps to the neighbour on click and disables a missing side", () => {
  const onStep = jest.fn();
  render(
    <CatalogNeighbourNav
      neighbours={{ previous: null, next: { id: 12, page: 1 }, position: { n: 1, total: 1200 }, step: jest.fn() }}
      onStep={onStep}
    />,
  );
  expect(screen.getByRole("navigation", { name: "Catalog neighbours" })).toBeTruthy();
  expect(screen.getByText("Record 1 of 1,200")).toBeTruthy();
  const previous = screen.getByRole("button", { name: "Previous marking" }) as HTMLButtonElement;
  expect(previous.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next marking" }));
  expect(onStep).toHaveBeenCalledWith({ id: 12, page: 1 });
});
