/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Contribute from "./Contribute";
import CoverEdit from "./CoverEdit";
import { createContribution, getContribution } from "@/services/contributions";
import { getMarkingByIdRaw, getMarkingCovers } from "@/services/markings";
import { getCoverById } from "@/services/covers";

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
jest.mock("@/services/covers", () => ({ getCoverById: jest.fn() }));
jest.mock("@/services/markings", () => ({
  getMarkingByIdRaw: jest.fn(), getMarkingCovers: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

const preferenceLabel = "Would you like your name to display as the submitter?";
const preservedMessage = "The original Contributor's public-name preference will stay unchanged.";
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
});

function openForm(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/contribute" element={<Contribute />} />
    <Route path="/edit/:id" element={<Contribute />} />
    <Route path="/markings/:id/covers/new" element={<CoverEdit />} />
    <Route path="/markings/:id/covers/:coverId/edit" element={<CoverEdit />} />
    <Route path="/dashboard" element={<div>Saved</div>} />
    <Route path="/record/:id" element={<div>Saved</div>} />
    <Route path="/record/:id/cover/:coverId" element={<div>Saved</div>} />
  </Routes></MemoryRouter>);
}

it.each([
  ["Marking", false, false], ["Marking", false, true],
  ["Marking", true, false], ["Marking", true, true],
  ["Cover", false, false], ["Cover", false, true],
  ["Cover", true, false], ["Cover", true, true],
])("%s edit: creator=%s, resumed draft=%s", async (kind, isCreator, resumed) => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, state: "VA", town: "Richmond", type: "TOWNMARK", is_manuscript: true,
    images: [], citations: [], display_submitter_name: false, can_change_submitter_name: isCreator,
  });
  const cover = {
    id: 9, type: "FC", datesSeen: [], description: "Ready",
    displaySubmitterName: false, canChangeSubmitterName: isCreator,
  };
  (getMarkingCovers as jest.Mock).mockResolvedValue({ covers: [{ id: 1, coverDetails: cover }] });
  (getCoverById as jest.Mock).mockResolvedValue(cover);
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", town: "Richmond", type: kind === "Cover" ? "FC" : "TOWNMARK",
    submission_kind: kind === "Cover" ? "cover" : "marking",
    parent_marking_id: 7, is_manuscript: true, description: "Ready",
    ...(kind === "Cover" ? { edit_cover_id: 9 } : { edit_marking_id: 7 }),
    // An old draft can still carry the other Contributor's checkbox value.
    display_submitter_name: false,
  } });
  const path = kind === "Cover"
    ? resumed ? "/markings/7/covers/new?edit=1" : "/markings/7/covers/9/edit"
    : resumed ? "/contribute?edit=1" : "/edit/7";
  openForm(path);
  if (isCreator) {
    fireEvent.click(await screen.findByRole("checkbox", { name: preferenceLabel }));
  } else {
    await screen.findByText(preservedMessage);
    expect(screen.queryByRole("checkbox", { name: preferenceLabel })).toBeNull();
  }
  fireEvent.click(await screen.findByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  if (payload instanceof FormData) {
    expect(payload.get("display_submitter_name")).toBe(isCreator ? "true" : null);
  } else {
    expect(payload.display_submitter_name).toBe(isCreator ? true : undefined);
  }
});

it.each(["Marking", "Cover"])("keeps opt-in on new %s drafts", async (kind) => {
  (getMarkingCovers as jest.Mock).mockResolvedValue({ covers: [] });
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", town: "Richmond", type: kind === "Cover" ? "FC" : "TOWNMARK",
    submission_kind: kind === "Cover" ? "cover" : "marking", parent_marking_id: 7,
  } });
  openForm(kind === "Cover" ? "/markings/7/covers/new?edit=1" : "/contribute?edit=1");
  fireEvent.click(await screen.findByRole("checkbox", { name: preferenceLabel }));
  fireEvent.click(await screen.findByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  expect(payload instanceof FormData ? payload.get("display_submitter_name") : payload.display_submitter_name)
    .toBe(payload instanceof FormData ? "true" : true);
});
