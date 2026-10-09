/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Contribute from "./Contribute";
import CoverEdit from "./CoverEdit";
import { createContribution, getContribution } from "@/services/contributions";
import { getReferenceWorks } from "@/services/referenceWorks";
import { getMarkingByIdRaw } from "@/services/markings";
import { listCitationsForSubject } from "@/services/citations";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "contributor" }) }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
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
  ...jest.requireActual("@/services/referenceWorks"), getReferenceWorks: jest.fn(),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn() }));
jest.mock("@/services/markings", () => ({
  getMarkingByIdRaw: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getMarkingCovers: jest.fn().mockResolvedValue({ covers: [{ id: 9, coverDetails: { id: 9, datesSeen: [] } }] }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

const refs = [11, 22].map((id) => ({ id, title: `Source ${id}`, code: `REF${id}`, edition: "" }));
const details = refs.map((work) => ({ reference_work_id: work.id, page_number: String(work.id), url: `https://example.com/${work.id}` }));
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  (getReferenceWorks as jest.Mock).mockResolvedValue(refs);
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
});

function open(path: string, route: string, page: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={page} />
    <Route path="/dashboard" element={<div>Saved</div>} />
    <Route path="/record/:id" element={<div>Saved</div>} />
  </Routes></MemoryRouter>);
}

it.each(["Marking", "Cover"])("resumes and saves both %s Citation selections and details", async (kind) => {
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", type: kind === "Cover" ? "FC" : "TOWNMARK",
    submission_kind: kind === "Cover" ? "cover" : "marking",
    parent_marking_id: 7, reference_work_ids: [11, 22], reference_work_details: details,
  } });
  open(kind === "Cover" ? "/markings/7/covers/new?edit=1" : "/contribute?edit=1",
    kind === "Cover" ? "/markings/:id/covers/new" : "/contribute",
    kind === "Cover" ? <CoverEdit /> : <Contribute />);
  expect(await screen.findByDisplayValue("https://example.com/11")).toBeTruthy();
  expect(screen.getByDisplayValue("https://example.com/22")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0];
  if (payload instanceof FormData) {
    expect(payload.getAll("reference_work_ids[]")).toEqual(["11", "22"]);
    expect(JSON.parse(String(payload.get("reference_work_details")))).toEqual(details);
  } else {
    expect(payload.reference_work_ids).toEqual([11, 22]);
    expect(payload.reference_work_details).toEqual(details);
  }
});

it("preloads existing Marking Citations before saving an edit", async () => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, state: "VA", town: "Richmond", type: "TOWNMARK", images: [],
    citations: refs.map((work) => ({ reference_work: work.id, citation_detail: `p. ${work.id} - https://example.com/${work.id}` })),
  });
  open("/edit/7", "/edit/:id", <Contribute />);
  expect(await screen.findByDisplayValue("https://example.com/11")).toBeTruthy();
  expect(screen.getByDisplayValue("https://example.com/22")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  const payload = (createContribution as jest.Mock).mock.calls[0][0] as FormData;
  expect(payload.getAll("reference_work_ids[]")).toEqual(["11", "22"]);
  expect(JSON.parse(String(payload.get("reference_work_details")))).toEqual(details);
});

it("blocks a Cover edit when existing Citations cannot be loaded", async () => {
  (listCitationsForSubject as jest.Mock).mockRejectedValue(new Error("Network error"));
  open("/markings/7/covers/9/edit", "/markings/:id/covers/:coverId/edit", <CoverEdit />);
  await waitFor(() => expect(listCitationsForSubject).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole("button", { name: /save as draft/i }));
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
    description: "Could not load Citations. Reload before saving.",
  }));
  expect(createContribution).not.toHaveBeenCalled();
});
