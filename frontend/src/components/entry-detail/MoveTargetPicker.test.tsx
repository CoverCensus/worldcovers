/**
 * @jest-environment jsdom
 */
/**
 * issues.md 114 / Trello T38 -- choosing where to move an image.
 *
 * This replaces a Radix <Select> whose items were single-line catalog codes.
 * Two reasons it is a plain list instead:
 *
 * 1. A destination needs a thumbnail and an identifying line, and a Select item
 *    is single-line by design.
 * 2. No test in this repo drives a Radix Select, and jsdom has no
 *    hasPointerCapture / scrollIntoView shims, so logic inside one is logic
 *    that cannot be tested. At Richmond this control has 147 options and every
 *    mis-selection is silent damage to the catalog -- it has to be testable.
 */
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");

import { MoveTargetPicker } from "./MoveTargetPicker";
import type { MoveTargetDescription } from "@/lib/moveTargetDisplay";

const target = (
  id: number,
  title: string,
  detail: string,
  thumbnailUrl: string | null = null,
): MoveTargetDescription => ({
  id,
  title,
  detail,
  thumbnailUrl,
  searchText: `${title} ${detail}`.toLowerCase(),
});

const targets = [
  target(31108, "ASCC6-VA-M2110", "Townmark · Circle · Black", "/media/a.png"),
  target(31110, "ASCC6-VA-M2147", "Auxmark · PAID · Box"),
];

const renderPicker = (over: Partial<Parameters<typeof MoveTargetPicker>[0]> = {}) =>
  render(
    <MoveTargetPicker
      targets={targets}
      selectedId={null}
      onSelect={() => {}}
      filterLabel="Find a marking"
      filterPlaceholder="Search by code, inscription, shape…"
      emptyMessage="No markings match that search."
      {...over}
    />,
  );

describe("MoveTargetPicker", () => {
  it("offers every candidate with its identifying detail, not just a code", () => {
    renderPicker();

    expect(screen.getByRole("radio", { name: /ASCC6-VA-M2110/ })).toBeTruthy();
    // The detail line is the point of the issue, so assert it reaches the DOM.
    expect(screen.getByText("Townmark · Circle · Black")).toBeTruthy();
  });

  it("narrows a long list to what the editor typed", () => {
    renderPicker();

    fireEvent.change(screen.getByLabelText("Find a marking"), { target: { value: "paid" } });

    expect(screen.queryByRole("radio", { name: /M2110/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /M2147/ })).toBeTruthy();
  });

  it("reports the chosen target through aria-checked", () => {
    renderPicker({ selectedId: 31110 });

    expect(screen.getByRole("radio", { name: /M2147/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /M2110/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("calls back with the id of the row that was clicked", () => {
    const onSelect = jest.fn();
    renderPicker({ onSelect });

    fireEvent.click(screen.getByRole("radio", { name: /M2147/ }));

    expect(onSelect).toHaveBeenCalledWith(31110);
  });

  it("explains an empty result rather than showing a blank panel", () => {
    renderPicker();

    fireEvent.change(screen.getByLabelText("Find a marking"), { target: { value: "zzzz" } });

    expect(screen.getByText("No markings match that search.")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("disables every row while a move is in flight", () => {
    renderPicker({ disabled: true });

    screen
      .getAllByRole("radio")
      .forEach((row) => expect(row.hasAttribute("disabled")).toBe(true));
  });
});
