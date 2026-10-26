/** @jest-environment jsdom */
// Trello T92 -- on a Marking edit, a whole-cover upload becomes a Cover draft
// for the published Marking and leaves the edit.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import { createContribution } from "@/services/contributions";
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
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));
// jsdom cannot decode images; every upload reads as a whole cover.
jest.mock("@/lib/imageShape", () => ({
  ...jest.requireActual("@/lib/imageShape"),
  measureImageFile: jest.fn().mockResolvedValue({ width: 2400, height: 1400 }),
  looksLikeWrongKind: () => true,
}));
jest.mock("@/lib/imageResolution", () => ({
  measureImageDpi: jest.fn().mockResolvedValue(null),
  isBelowPreferredImageDpi: () => false,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.URL.createObjectURL = jest.fn(() => "blob:preview");
  global.URL.revokeObjectURL = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  (getMarkingByIdRaw as jest.Mock).mockResolvedValue({
    id: 7, state: "VA", town: "Richmond", type: "TOWNMARK", images: [], citations: [],
  });
});

function open(path: string, route: string) {
  return render(<TooltipProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={<Contribute />} />
    <Route path="/record/:id/cover/new" element={<div>Cover editor</div>} />
  </Routes></MemoryRouter></TooltipProvider>);
}

const offer = /Make this a Cover for this Marking/;

async function uploadWholeCover() {
  const scan = new File(["cover"], "whole-cover.png", { type: "image/png" });
  const input = document.getElementById("marking-images-input") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [scan] } });
  await screen.findByAltText(/ image 1$/);
  await screen.findByText(/may show a whole Cover/);
}

it("turns the upload into a Cover draft for the Marking and drops it from the edit", async () => {
  let finishCreate!: (value: unknown) => void;
  (createContribution as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishCreate = resolve; }));
  open("/edit/7", "/edit/:id");
  await screen.findByRole("button", { name: /save as draft/i });
  await uploadWholeCover();
  expect(screen.getByText(/becomes a Cover draft you finish and submit separately/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: offer }));
  await waitFor(() => expect(createContribution).toHaveBeenCalledTimes(1));
  // While the request is in flight the offer is disabled and announced busy,
  // so a second click cannot create a second draft.
  const busy = screen.getByRole("button", { name: offer }) as HTMLButtonElement;
  expect(busy.disabled).toBe(true);
  expect(busy.getAttribute("aria-busy")).toBe("true");
  finishCreate({ contributionId: 55, markingId: null, coverId: null, raw: {} });
  const payload = (createContribution as jest.Mock).mock.calls[0][0] as FormData;
  expect(payload instanceof FormData).toBe(true);
  expect(payload.get("submission_kind")).toBe("cover");
  expect(payload.get("save_as_draft")).toBe("true");
  expect(payload.get("state")).toBe("VA");
  expect(payload.get("parent_marking_id")).toBe("7");
  expect(payload.get("marking_id")).toBe("7");
  expect(payload.getAll("cover_image").map((f) => (f as File).name)).toEqual(["whole-cover.png"]);
  expect(JSON.parse(String(payload.get("cover_image_tags")))).toEqual(["photograph"]);
  expect(JSON.parse(String(payload.get("image_order")))).toEqual(["__new__"]);

  await waitFor(() => expect(screen.queryByAltText(/ image 1$/)).toBeNull());
  expect(screen.queryByText(/may show a whole Cover/)).toBeNull();
  const finish = await screen.findByRole("link", { name: /Finish the Cover draft/ });
  expect(finish.getAttribute("href")).toBe("/record/7/cover/new?edit=55");
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Cover draft saved" }));
});

it("keeps the upload on the edit when the draft cannot be saved", async () => {
  (createContribution as jest.Mock).mockRejectedValue(new Error("Request failed with status code 500"));
  open("/edit/7", "/edit/:id");
  await screen.findByRole("button", { name: /save as draft/i });
  await uploadWholeCover();

  fireEvent.click(screen.getByRole("button", { name: offer }));
  await waitFor(() => expect(createContribution).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save the Cover draft", variant: "destructive" })),
  );
  expect(screen.getByAltText(/ image 1$/)).toBeTruthy();
  expect(screen.getByText(/may show a whole Cover/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Finish the Cover draft/ })).toBeNull();
});

it("does not offer the draft on a new Marking, where the Cover section applies", async () => {
  open("/contribute", "/contribute");
  await screen.findByRole("button", { name: /save as draft/i });
  await uploadWholeCover();
  expect(screen.queryByRole("button", { name: offer })).toBeNull();
  expect(screen.getByRole("button", { name: /Also submit it as the Cover/ })).toBeTruthy();
});
