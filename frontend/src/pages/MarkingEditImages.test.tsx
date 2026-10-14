/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Contribute from "./Contribute";
import { getContribution } from "@/services/contributions";
import { getMarkingByIdRaw } from "@/services/markings";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "contributor" }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
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

function openForm(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/contribute" element={<Contribute />} />
    <Route path="/edit/:id" element={<Contribute />} />
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
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue(marking);
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
});
