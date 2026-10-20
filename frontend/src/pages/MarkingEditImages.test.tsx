/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Contribute from "./Contribute";
import { createContribution, getContribution } from "@/services/contributions";
import { getMarkingByIdRaw } from "@/services/markings";
import { deleteDateSeen } from "@/services/datesSeen";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
let mockRole = "contributor";
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: mockRole }) }));
jest.mock("@/services/datesSeen", () => ({
  ...jest.requireActual("@/services/datesSeen"), deleteDateSeen: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/similarEntries", () => ({ getSimilarMarkings: jest.fn().mockResolvedValue({ rows: [], matchCount: 0, relatedCount: 0 }) }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/regions", () => ({ getRegions: jest.fn().mockResolvedValue([{ value: "VA", label: "Virginia" }]) }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  getContribution: jest.fn(), createContribution: jest.fn(),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "VA-7" }),
  listContributions: jest.fn().mockResolvedValue({ rawItems: [] }),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"), getReferenceWorks: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingByIdRaw: jest.fn(),
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
});

const marking = {
  id: 7, state: "VA", town: "Richmond", type: "TOWNMARK", is_manuscript: true, citations: [],
  images: [{ image_url: "https://hellowoco.app/media/va/current.jpg", is_tracing: false }],
};

beforeEach(() => {
  mockRole = "contributor";
  jest.clearAllMocks();
});

function openForm(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/contribute" element={<Contribute />} />
    <Route path="/edit/:id" element={<Contribute />} />
    <Route path="/dashboard" element={null} />
  </Routes></MemoryRouter>);
}

it("shows a marking's current images read-only on Submit Edit", async () => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue(marking);
  openForm("/edit/7");

  const strip = await screen.findByTestId("current-marking-images");
  expect(within(strip).getByAltText("Current marking image 1")).toBeTruthy();
  expect(within(strip).queryByRole("button")).toBeNull();
  expect(screen.queryByText("No image is available to upload")).toBeNull();
});

it("keeps a resumed edit draft's own upload editable and the marking's images read-only", async () => {
  mockRole = "editor";
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({ ...marking, can_edit_dates: true });
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", town: "Richmond", type: "TOWNMARK", submission_kind: "marking",
    is_manuscript: true, edit_marking_id: 7,
    marking_image_metas: [{ storage_filename: "va/current.jpg" }, { storage_filename: "va/mine.jpg" }],
  } });
  openForm("/contribute?edit=1");

  const strip = await screen.findByTestId("current-marking-images");
  expect(within(strip).getAllByRole("img")).toHaveLength(1);
  expect(await screen.findByText("Saved with draft")).toBeTruthy();
  expect(screen.getAllByAltText(/Add Marking Images image/)).toHaveLength(1);
  expect(await screen.findByRole("button", { name: "Add date" })).toBeTruthy();
});

it("places Dates seen above the range and refreshes dates without clearing other edits", async () => {
  mockRole = "editor";
  const datedMarking = {
    ...marking, can_edit_dates: true,
    earliest_seen: "1832-01-01", earliest_seen_granularity: "YEAR",
    latest_seen: "1851-01-01", latest_seen_granularity: "YEAR",
    dates_seen: [{ id: 3, date: "1832-01-01", granularity: "YEAR", date_year: 1832 }],
  };
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue(datedMarking);
  openForm("/edit/7");
  const add = await screen.findByRole("button", { name: "Add date" });
  const earliest = document.getElementById("marking-erd-year") as HTMLInputElement;
  const latest = document.getElementById("marking-lrd-year") as HTMLInputElement;
  expect(add.compareDocumentPosition(earliest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Keep this edit" } });
  fireEvent.change(latest, { target: { value: "1852" } });
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    ...datedMarking, earliest_seen: "1840-01-01",
    dates_seen: [{ id: 4, date: "1840-01-01", granularity: "YEAR", date_year: 1840 }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove date" }));
  await waitFor(() => expect(earliest.value).toBe("1840"));
  expect(deleteDateSeen).toHaveBeenCalledWith(3);
  expect(latest.value).toBe("1852");
  expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Keep this edit");
  expect(screen.getByText(/Changes here save immediately/)).toBeTruthy();
});

it("hides date controls when the server denies date editing", async () => {
  mockRole = "editor";
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({ ...marking, can_edit_dates: false });
  openForm("/edit/7");
  await screen.findByTestId("current-marking-images");
  expect(screen.queryByRole("button", { name: "Add date" })).toBeNull();
});

it("lets Editors add and remove dates on a new Marking before it exists", async () => {
  mockRole = "editor";
  openForm("/contribute");
  fireEvent.click(await screen.findByRole("button", { name: "Add date" }));
  expect(screen.queryByText("Recorded date range")).toBeNull();
  fireEvent.change(document.getElementById("date-new-year")!, { target: { value: "1840" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("1840")).toBeTruthy();
  expect(screen.getByText("Recorded date range")).toBeTruthy();
  const add = screen.getByRole("button", { name: "Add date" });
  expect(add.compareDocumentPosition(document.getElementById("marking-erd-year")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText(/These dates save with your submission/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove date" }));
  await screen.findByText("No dates added to this submission.");
  expect(screen.queryByText("Recorded date range")).toBeNull();
  expect(createContribution).not.toHaveBeenCalled();
  expect(deleteDateSeen).not.toHaveBeenCalled();
});

it("hides the range after the last saved Marking date is removed", async () => {
  mockRole = "editor";
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    ...marking, can_edit_dates: true,
    dates_seen: [{ id: 3, date: "1840-01-01", granularity: "YEAR", date_year: 1840 }],
  });
  openForm("/edit/7");
  await screen.findByRole("button", { name: "Remove" });
  expect(screen.getByText("Recorded date range")).toBeTruthy();
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({ ...marking, can_edit_dates: true, dates_seen: [] });
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove date" }));
  await waitFor(() => expect(screen.queryByText("Recorded date range")).toBeNull());
});

it("restores a new Marking draft's dates and saves an edited list with the draft", async () => {
  mockRole = "editor";
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", submission_kind: "marking", marking_dates_seen: [
      { date_year: 1840, date_month: null, date_day: null, granularity: "YEAR", date: "1840-01-01" },
    ],
  } });
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
  openForm("/contribute?edit=1");
  await screen.findByText("1840");
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(document.getElementById("date-1-year")!, { target: { value: "1850" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("1850");
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalledWith(expect.objectContaining({
    marking_dates_seen: [{ date_year: 1850, date_month: null, date_day: null }],
  })));
});

it("does not validate or send hidden boundary dates from a draft with no Dates Seen", async () => {
  mockRole = "editor";
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", submission_kind: "marking", marking_dates_seen: [],
    marking_erd_date_year: 1850, marking_lrd_date_year: 1840,
  } });
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
  openForm("/contribute?edit=1");
  await screen.findByText("No dates added to this submission.");
  expect(screen.queryByText("Recorded date range")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  expect(payload.marking_dates_seen).toEqual([]);
  expect(payload.marking_erd_date_year).toBeUndefined();
  expect(payload.marking_lrd_date_year).toBeUndefined();
});
