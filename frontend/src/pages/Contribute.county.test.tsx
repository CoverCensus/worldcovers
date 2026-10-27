/** @jest-environment jsdom */
// Trello T70 -- a county on the Marking form: picked under the state, carried
// through draft resume and edit prefill, sent beside state and town.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import { createContribution, getContribution } from "@/services/contributions";
import { getMarkingByIdRaw } from "@/services/markings";
import { getCountyRegions } from "@/services/regions";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "contributor" }) }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/similarEntries", () => ({ getSimilarMarkings: jest.fn().mockResolvedValue({ rows: [], matchCount: 0, relatedCount: 0 }) }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/regions", () => ({
  getRegions: jest.fn().mockResolvedValue([
    { value: "Virginia", label: "Virginia", id: 5, abbrev: "VA" },
    { value: "Maryland", label: "Maryland", id: 6, abbrev: "MD" },
  ]),
  getCountyRegions: jest.fn().mockResolvedValue([{ id: 9, name: "Accomack" }, { id: 4, name: "Albemarle" }]),
}));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  getContribution: jest.fn(), createContribution: jest.fn(),
  listContributions: jest.fn().mockResolvedValue({ items: [] }),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"), getReferenceWorks: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingByIdRaw: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
});

function open(path: string, route: string) {
  return render(<TooltipProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={<Contribute />} />
    <Route path="/dashboard" element={<div>Saved</div>} />
  </Routes></MemoryRouter></TooltipProvider>);
}

it("resumes a draft's county by the state's id and sends id and name with the draft", async () => {
  // The draft stores the abbreviation; the options carry the name, id and abbreviation.
  (getContribution as jest.Mock).mockResolvedValue({
    id: 1, status: "draft", submittedData: { state: "VA", town: "Onancock", county_id: 9, submission_kind: "marking" },
  });
  open("/contribute?edit=1", "/contribute");
  await waitFor(() => expect(getCountyRegions).toHaveBeenCalledWith(5));
  await screen.findByText("Accomack");

  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  const get = (key: string) => (payload instanceof FormData ? payload.get(key) : payload[key]);
  expect(String(get("county_id"))).toBe("9");
  expect(String(get("county"))).toBe("Accomack");
  expect(String(get("county_proposed"))).toBe("");
});

it("prefills the county from the marking's region links on edit and disables the typed county", async () => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, state: "Virginia", town: "Onancock", type: "TOWNMARK", images: [], citations: [],
    regions: [
      { id: 5, name: "Virginia", abbrev: "VA", region_tier: "STATE" },
      { id: 9, name: "Accomack", abbrev: "VA", region_tier: "COUNTY" },
    ],
  });
  open("/edit/7", "/edit/:id");
  await screen.findByRole("button", { name: /save as draft/i });
  await screen.findByText("Accomack");
  expect((screen.getByLabelText("County not listed") as HTMLInputElement).disabled).toBe(true);
});

it("keeps the County selector and the typed county off until a state is chosen", async () => {
  open("/contribute", "/contribute");
  await screen.findByRole("button", { name: /save as draft/i });
  expect((screen.getByRole("combobox", { name: "County" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("County not listed") as HTMLInputElement).disabled).toBe(true);
  expect(getCountyRegions).not.toHaveBeenCalled();
});

it("changing the state empties the picked county and sends both county keys empty", async () => {
  (getContribution as jest.Mock).mockResolvedValue({
    id: 1, status: "draft", submittedData: { state: "VA", town: "Onancock", county_id: 9, county: "Accomack", submission_kind: "marking" },
  });
  open("/contribute?edit=1", "/contribute");
  await waitFor(() => expect(getCountyRegions).toHaveBeenCalledWith(5));
  await screen.findByText("Accomack");

  fireEvent.click(screen.getByRole("combobox", { name: "State" }));
  fireEvent.click(await screen.findByText("Maryland"));
  await waitFor(() => expect(getCountyRegions).toHaveBeenCalledWith(6));
  expect(screen.queryByText("Accomack")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  const get = (key: string) => (payload instanceof FormData ? payload.get(key) : payload[key]);
  expect(String(get("state"))).toBe("Maryland");
  expect(String(get("county_id"))).toBe("");
  expect(String(get("county"))).toBe("");
  expect(String(get("county_proposed"))).toBe("");
});

it("sends a typed county that is not in the list, with no county id", async () => {
  (getContribution as jest.Mock).mockResolvedValue({
    id: 1, status: "draft", submittedData: { state: "VA", town: "Suffolk", submission_kind: "marking" },
  });
  open("/contribute?edit=1", "/contribute");
  await waitFor(() => expect(getCountyRegions).toHaveBeenCalledWith(5));
  fireEvent.change(screen.getByLabelText("County not listed"), { target: { value: "Nansemond" } });
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  const get = (key: string) => (payload instanceof FormData ? payload.get(key) : payload[key]);
  expect(String(get("county_proposed"))).toBe("Nansemond");
  expect(String(get("county_id"))).toBe("");
});
