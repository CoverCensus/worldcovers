/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SimilarEntriesPanel, type SimilarRow } from "@/components/SimilarEntriesPanel";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");

const rows: SimilarRow[] = [
  { id: 7, href: "/record/7", title: 'Abingdon, VA - "ABINGDON/VA."', detail: "Townmark · Circle · Black", tierLabel: "Looks like an existing Marking" },
  { id: 9, href: "/record/9", title: 'Abingdon, VA - "ABINGDON VA"', detail: "Townmark · Circle · Red", tierLabel: "Same town and inscription, different details" },
];

describe("SimilarEntriesPanel", () => {
  it("renders nothing when there is nothing to say", () => {
    const { container } = render(<SimilarEntriesPanel noun="Markings" rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists candidates as new-tab links with their tier, as a polite status", () => {
    render(<SimilarEntriesPanel noun="Markings" rows={rows} totalCount={12} />);
    const panel = screen.getByRole("status");
    expect(panel).toHaveTextContent("Similar existing Markings (12, showing 2)");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/record/7", "/record/9"]);
    expect(links.every((a) => a.getAttribute("target") === "_blank")).toBe(true);
    expect(panel).toHaveTextContent("Looks like an existing Marking");
    expect(panel).toHaveTextContent("Same town and inscription, different details");
    expect(panel).toHaveTextContent("You can still submit");
  });
});
