/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getMarkingsPage } from "@/services/markings";
import Search from "./Search";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/hooks/useFilterOptions", () => ({ useFilterOptions: () => ({
  colorOptions: [], stateOptions: [], shapeOptions: [{ value: "7", label: "C - Circle" }],
  isLoading: false, error: null,
}) }));
jest.mock("@/hooks/useMarkingYearRange", () => ({
  useMarkingYearRange: () => ({ earliestYear: 1700, latestYear: 1900 }),
}));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorkOptions: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingsPage: jest.fn().mockResolvedValue({ results: [], count: 0 }),
}));

function CurrentLocation() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function openSearch(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TooltipProvider>
    <MemoryRouter initialEntries={[`/search${query}`]}>
      <Search /><CurrentLocation />
    </MemoryRouter>
  </TooltipProvider></QueryClientProvider>);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  window.scrollTo = jest.fn();
});

beforeEach(() => jest.clearAllMocks());

it("ignores Shape and Dimensions in a manuscript-only search URL", async () => {
  openSearch("?manuscripts=only&shape=7&height=25&width=25");
  await waitFor(() => expect(getMarkingsPage).toHaveBeenCalled());
  expect(screen.queryByLabelText("Filter by shape")).toBeNull();
  expect(screen.queryByLabelText(/Filter by (height|width|diameter) in millimeters/)).toBeNull();
  for (const call of (getMarkingsPage as jest.Mock).mock.calls) {
    expect(call[2]).toMatchObject({ manuscripts: "only", shapeId: undefined, height: undefined, width: undefined });
  }
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("?manuscripts=only"));
});

it("clears Shape and Dimensions when Only is selected and restores empty controls for Both", async () => {
  const user = userEvent.setup();
  openSearch("?shape=7&height=25&width=25");
  await screen.findByLabelText("Filter by diameter in millimeters");
  await user.click(screen.getByRole("combobox", { name: "Show manuscripts" }));
  await user.click(await screen.findByRole("option", { name: "Only" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("?manuscripts=only"));
  expect(screen.queryByLabelText("Filter by shape")).toBeNull();
  expect(screen.queryByLabelText(/Filter by (height|width|diameter) in millimeters/)).toBeNull();
  await user.click(screen.getByRole("combobox", { name: "Show manuscripts" }));
  await user.click(await screen.findByRole("option", { name: "Both (Default)" }));
  await waitFor(() => expect((screen.getByLabelText("Filter by height in millimeters") as HTMLInputElement).value).toBe(""));
  expect((screen.getByLabelText("Filter by width in millimeters") as HTMLInputElement).value).toBe("");
  expect(screen.getByLabelText("Filter by shape")).toBeTruthy();
});
