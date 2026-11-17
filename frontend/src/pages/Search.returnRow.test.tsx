/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getMarkingsPage } from "@/services/markings";
import { readCatalogQuery, rememberCatalogRow, takeCatalogRow } from "@/lib/catalogCursor";
import Search from "./Search";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/hooks/useFilterOptions", () => ({ useFilterOptions: () => ({
  colorOptions: [], stateOptions: [{ value: "FL", label: "Florida" }], shapeOptions: [],
  isLoading: false, error: null,
}) }));
jest.mock("@/hooks/useMarkingYearRange", () => ({
  useMarkingYearRange: () => ({ earliestYear: 1700, latestYear: 1900 }),
}));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorkOptions: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingsPage: jest.fn(),
}));

const marking = {
  id: 42,
  code: "ASCC6-FL-M42",
  type: "TOWNMARK",
  town: "Benton",
  state: "Florida",
  stateAbbrev: "FL",
  postOfficeName: "Benton",
  inscriptionTxt: "BENTON",
  shapeName: "Circle",
  colorName: "Black",
  images: [],
};
const rows = [marking, { ...marking, id: 43, code: "ASCC6-FL-M43", town: "Milton", postOfficeName: "Milton", inscriptionTxt: "MILTON" }];

function openSearch(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TooltipProvider>
    <MemoryRouter initialEntries={[`/search${query}`]}>
      <Routes>
        <Route path="/search" element={<Search />} />
        <Route path="/record/:id" element={<div>record page</div>} />
      </Routes>
    </MemoryRouter>
  </TooltipProvider></QueryClientProvider>);
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  window.scrollTo = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
  (getMarkingsPage as jest.Mock).mockResolvedValue({ results: rows, count: 2, next: null, previous: null });
});

it("scrolls the row the viewer opened back into view, once", async () => {
  rememberCatalogRow("state=FL", 43);
  openSearch("?state=FL");
  await screen.findByText(/Milton, FL/);
  const scrolled = Element.prototype.scrollIntoView as jest.Mock;
  await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
  const target = scrolled.mock.contexts[0] as HTMLElement;
  expect(target.getAttribute("data-marking-id")).toBe("43");
  expect(scrolled).toHaveBeenCalledWith({ block: "center" });
  expect(takeCatalogRow("state=FL")).toBeNull();
});

it("leaves a row remembered for another view alone", async () => {
  rememberCatalogRow("state=VA", 43);
  openSearch("?state=FL");
  await screen.findByText(/Milton, FL/);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it("remembers the list query it ran and the row that was opened", async () => {
  openSearch("?state=FL");
  await screen.findByText(/Milton, FL/);
  await waitFor(() => expect(readCatalogQuery()).toMatchObject({ search: "state=FL", page: 1, pageSize: 25 }));
  expect(readCatalogQuery()?.options).toMatchObject({ state: "FL", ordering: expect.stringMatching(/,id$/) });

  fireEvent.click(screen.getByText(/Milton, FL/));
  await screen.findByText("record page");
  expect(takeCatalogRow("state=FL")).toBe(43);
});
