/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import { getMarkingByIdRaw } from "@/services/markings";
import { getSimilarMarkings } from "@/services/similarEntries";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "contributor" }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/similarEntries", () => ({ getSimilarMarkings: jest.fn() }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/regions", () => ({ getRegions: jest.fn().mockResolvedValue([{ value: "VA", label: "Virginia" }]) }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  getContribution: jest.fn(), createContribution: jest.fn(),
  listContributions: jest.fn().mockResolvedValue({ items: [] }),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "VA-NEW" }),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"),
  getReferenceWorks: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingByIdRaw: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getMarkingCovers: jest.fn().mockResolvedValue({ covers: [] }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

const SOURCE = {
  id: 7, type: "TOWNMARK", state: "Virginia", town: "Abingdon", inscription_txt: "ABINGDON/VA.",
  is_manuscript: false, is_irreg: false, impression: "Normal", desc: "", modified_date: "2026-10-01T00:00:00Z",
};
const TWIN = {
  rows: [{
    id: 9, tier: "match", town: "Abingdon", stateAbbrev: "VA", type: "TOWNMARK", inscription: "ABINGDON/VA.",
    isManuscript: false, shapeName: "C - Circle", colorName: "BLACK", colorHex: "#000000", width: "24",
    height: "24", earliestSeen: "1813-01-01", latestSeen: "1813-01-01", mainImageUrl: null,
  }],
  matchCount: 1,
  relatedCount: 0,
};

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue(SOURCE);
});

function open(path: string, route: string) {
  render(<TooltipProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={<Contribute />} />
  </Routes></MemoryRouter></TooltipProvider>);
}

it("shows similar Markings once the key fields settle, without gating Submit", async () => {
  (getSimilarMarkings as jest.Mock).mockResolvedValue(TWIN);
  open("/contribute?copy=7", "/contribute");

  const panel = await screen.findByRole("status", {}, { timeout: 4000 });
  expect(panel).toHaveTextContent("Similar existing Markings (1)");
  expect(panel).toHaveTextContent("Looks like an existing Marking");
  const link = screen.getByRole("link", { name: /ABINGDON\/VA\./ });
  expect(link.getAttribute("href")).toBe("/record/9");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(getSimilarMarkings).toHaveBeenCalledTimes(1);
  expect(getSimilarMarkings).toHaveBeenCalledWith(expect.objectContaining({
    state: "Virginia", town: "Abingdon", type: "TOWNMARK", inscription: "ABINGDON/VA.", excludeId: null,
  }));
  expect(screen.getByRole("button", { name: /save as draft/i })).toBeEnabled();
});

it("excludes the Marking being edited and clears the panel when the town is cleared", async () => {
  (getSimilarMarkings as jest.Mock).mockResolvedValue(TWIN);
  open("/edit/7", "/edit/:id");

  await screen.findByRole("status", {}, { timeout: 4000 });
  expect(getSimilarMarkings).toHaveBeenCalledWith(expect.objectContaining({ excludeId: 7 }));

  const townInput = document.getElementById("town") as HTMLInputElement;
  fireEvent.change(townInput, { target: { value: "" } });
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 4000 });
});

it("stays quiet when the lookup fails", async () => {
  (getSimilarMarkings as jest.Mock).mockRejectedValue(new Error("boom"));
  open("/contribute?copy=7", "/contribute");

  await waitFor(() => expect(getSimilarMarkings).toHaveBeenCalled(), { timeout: 4000 });
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.getByRole("button", { name: /save as draft/i })).toBeEnabled();
});
