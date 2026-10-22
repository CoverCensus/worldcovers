/** @jest-environment jsdom */
// Trello T37 -- submit a new Marking and the Cover it came from in one go.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import { createContribution, getContribution } from "@/services/contributions";
import { getMarkingByIdRaw } from "@/services/markings";

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
jest.mock("@/services/regions", () => ({ getRegions: jest.fn().mockResolvedValue([{ value: "VA", label: "Virginia" }]) }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  getContribution: jest.fn(), createContribution: jest.fn(),
  listContributions: jest.fn().mockResolvedValue({ rawItems: [] }),
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
  // jsdom has no object URLs; the section previews files with them.
  global.URL.createObjectURL = jest.fn(() => "blob:preview");
  global.URL.revokeObjectURL = jest.fn();
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

const toggleName = /Also submit the Cover this marking is on/;

it("stages the Cover inside the Marking draft: fields as JSON, scan as pending_cover_image", async () => {
  // A resumed draft already carries the state a draft save needs.
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: { state: "VA", submission_kind: "marking" } });
  open("/contribute?edit=1", "/contribute");
  const toggle = await screen.findByRole("checkbox", { name: toggleName }, { timeout: 5000 });
  await waitFor(() => expect(screen.getByRole("button", { name: /save as draft/i })).toBeTruthy());

  fireEvent.click(toggle);
  const scan = new File(["cover"], "whole-cover.png", { type: "image/png" });
  const input = screen.getByLabelText(/Add cover image/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [scan] } });
  fireEvent.change(screen.getByLabelText(/Cover description/i), { target: { value: "Richmond to Norfolk" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Date unknown/i }));

  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0] as FormData;
  expect(payload instanceof FormData).toBe(true);
  const pc = JSON.parse(String(payload.get("pending_cover")));
  expect(pc).toMatchObject({ cover_date_unknown: true, description: "Richmond to Norfolk", type: "" });
  expect(payload.getAll("pending_cover_image").map((f) => (f as File).name)).toEqual(["whole-cover.png"]);
  expect(payload.get("drop_pending_cover")).toBeNull();
});

it("refuses a final submit whose Cover section is incomplete, before any request", async () => {
  open("/contribute", "/contribute");
  fireEvent.click(await screen.findByRole("checkbox", { name: toggleName }));
  // The marking's own required fields are empty too; both sets of errors show.
  fireEvent.click(screen.getByRole("button", { name: /^submit/i }));
  await waitFor(() => expect(screen.getByText("Cover type is required")).toBeTruthy());
  expect(screen.getByText("Add a cover date or mark it unknown")).toBeTruthy();
  expect(screen.getByText("Add at least one cover image")).toBeTruthy();
  expect(createContribution).not.toHaveBeenCalled();
});

it("resumes a draft's Cover and drops it when the section is turned off", async () => {
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", submission_kind: "marking",
    pending_cover: {
      type: "ENV", cover_date_unknown: false, cover_date_year: "1851", cover_date_month: "", cover_date_day: "",
      is_institutional: false, is_backstamp: true, description: "Saved cover",
      image_metas: [{ storage_filename: "va/saved.png" }],
    },
  } });
  open("/contribute?edit=1", "/contribute");
  const toggle = await screen.findByRole("checkbox", { name: toggleName }, { timeout: 5000 });
  await waitFor(() => expect((toggle as HTMLInputElement).getAttribute("aria-checked") ?? (toggle as HTMLInputElement).checked).toBeTruthy());
  expect(screen.getByDisplayValue("Saved cover")).toBeTruthy();
  expect(screen.getByAltText("Saved cover image")).toBeTruthy();

  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  const dropped = payload instanceof FormData ? payload.get("drop_pending_cover") : payload.drop_pending_cover;
  expect(String(dropped)).toBe("true");
});

it("has no Cover section on a Marking edit", async () => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, state: "VA", town: "Richmond", type: "TOWNMARK", images: [], citations: [],
  });
  open("/edit/7", "/edit/:id");
  await screen.findByRole("button", { name: /save as draft/i });
  expect(screen.queryByRole("checkbox", { name: toggleName })).toBeNull();
});
