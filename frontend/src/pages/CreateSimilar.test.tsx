/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import CoverEdit from "./CoverEdit";
import { createContribution } from "@/services/contributions";
import { getMarkingByIdRaw, getMarkingCovers } from "@/services/markings";
import { listCitationsForSubject } from "@/services/citations";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
// An Editor: the role whose form sends catalog codes and ERD/LRD, so a leak would show.
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "editor" }) }));
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
  listContributions: jest.fn().mockResolvedValue({ items: [] }),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "VA-NEW" }),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"),
  getReferenceWorks: jest.fn().mockResolvedValue([{ id: 11, title: "ASCC", code: "ASCC1", edition: "" }]),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn() }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingByIdRaw: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getMarkingCovers: jest.fn(),
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
beforeEach(() => {
  jest.clearAllMocks();
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
});

function open(path: string, route: string, page: React.ReactNode) {
  render(<TooltipProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={page} />
    <Route path="/dashboard" element={<div>Saved</div>} />
    <Route path="/record/:id" element={<div>Saved</div>} />
  </Routes></MemoryRouter></TooltipProvider>);
}

async function saveDraft(): Promise<FormData | Record<string, unknown>> {
  fireEvent.click(await screen.findByRole("button", { name: /save as draft/i }));
  await waitFor(() => expect(createContribution).toHaveBeenCalled());
  return (createContribution as jest.Mock).mock.calls[0][0];
}

const get = (payload: FormData | Record<string, unknown>, key: string) =>
  payload instanceof FormData ? payload.get(key) : (payload[key] ?? null);

it("starts a new Marking from another without its identity, dates, or images", async () => {
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, code: "VA-123", type: "TOWNMARK", state: "VA", town: "Richmond",
    inscription_txt: "RICHMOND VA", is_manuscript: true, desc: "Double circle",
    display_submitter_name: true, can_change_submitter_name: false,
    earliest_seen: "1850-06-01", earliest_seen_granularity: "DAY",
    images: [{ image_url: "/media/va/source.jpg", is_tracing: false }],
    citations: [{ reference_work: 11, citation_detail: "p. 12" }],
  });
  open("/contribute?copy=7", "/contribute", <Contribute />);

  expect(await screen.findByText(/Started from Richmond, VA - "RICHMOND VA"/)).toBeTruthy();
  const payload = await saveDraft();
  expect(get(payload, "town")).toBe("Richmond");
  expect(get(payload, "inscription_txt")).toBe("RICHMOND VA");
  expect(get(payload, "desc")).toBe("Double circle");
  expect(payload instanceof FormData ? payload.getAll("reference_work_ids[]") : payload.reference_work_ids)
    .toEqual(payload instanceof FormData ? ["11"] : [11]);
  for (const key of ["edit_marking_id", "marking_modified_at_baseline", "marking_erd", "marking_erd_date_year"]) {
    expect(get(payload, key)).toBeNull();
  }
  expect(get(payload, "catalog_code")).not.toBe("VA-123");
  expect(String(get(payload, "display_submitter_name"))).not.toBe("true");
  expect(screen.queryByTestId("current-marking-images")).toBeNull();
});

it("starts a new Cover under the same Marking without the source's date, comment, or link", async () => {
  (getMarkingCovers as jest.Mock).mockResolvedValue({ covers: [{
    id: 50, isBackstamp: true, contributorComment: "Their note",
    coverDetails: {
      id: 9, code: "C-9", type: "FC", isInstitutional: true, description: "Folded letter",
      displaySubmitterName: true, datesSeen: [{ date: "1851-03-01", granularity: "MONTH" }],
    },
  }] });
  (listCitationsForSubject as jest.Mock).mockResolvedValue([{ referenceWorkId: 11, citationDetail: "p. 3" }]);
  open("/record/7/cover/new?copy=9", "/record/:id/cover/new", <CoverEdit />);

  expect(await screen.findByText(/Started from Cover C-9/)).toBeTruthy();
  await waitFor(() => expect(listCitationsForSubject).toHaveBeenCalledWith({ subjectType: "COVER", subjectId: 9 }));
  const payload = await saveDraft();
  expect(get(payload, "type")).toBe("FC");
  expect(get(payload, "description")).toBe("Folded letter");
  expect(get(payload, "is_backstamp")).toBe("true");
  expect(get(payload, "is_institutional")).toBe("true");
  expect((payload as FormData).getAll("reference_work_ids[]")).toEqual(["11"]);
  for (const key of ["edit_cover_id", "edit_cover_marking_id", "cover_date_year", "cover_date", "contributor_comment"]) {
    expect(get(payload, key)).toBeNull();
  }
});
