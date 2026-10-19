/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntryImageGalleryCard } from "@/components/entry-detail/EntryImageGalleryCard";
import Contribute from "./Contribute";
import CoverEdit from "./CoverEdit";
import { createContribution, getContribution } from "@/services/contributions";

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
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getMarkingCovers: jest.fn().mockResolvedValue({ covers: [] }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom lacks these; the carousel library and cover previews call them.
  window.matchMedia = () =>
    ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => {
  jest.clearAllMocks();
  (createContribution as jest.Mock).mockResolvedValue({ id: 1 });
});

function resumeDraft(kind: "marking" | "cover", extra: Record<string, unknown> = {}) {
  (getContribution as jest.Mock).mockResolvedValue({ id: 1, status: "draft", submittedData: {
    state: "VA", type: kind === "cover" ? "FC" : "TOWNMARK", submission_kind: kind,
    parent_marking_id: 7, ...extra,
  } });
  const [path, route, page] = kind === "cover"
    ? ["/markings/7/covers/new?edit=1", "/markings/:id/covers/new", <CoverEdit />]
    : ["/contribute?edit=1", "/contribute", <Contribute />];
  return render(<TooltipProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={page} />
    <Route path="/dashboard" element={<div>Saved</div>} />
  </Routes></MemoryRouter></TooltipProvider>);
}

it.each(["marking", "cover"] as const)(
  "sends a %s upload's caption and keeps caption keys out of the drop zone",
  async (kind) => {
    const { container } = resumeDraft(kind);
    await screen.findByRole("button", { name: /save as draft/i }, { timeout: 5000 });
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, {
      target: { files: [new File(["png"], "strike.png", { type: "image/png" })] },
    });

    const caption = await screen.findByLabelText("Caption (optional)");
    const pickerClick = jest.spyOn(picker, "click");
    fireEvent.keyDown(caption, { key: " " });
    fireEvent.keyDown(caption, { key: "Enter" });
    fireEvent.click(caption);
    expect(pickerClick).not.toHaveBeenCalled();

    fireEvent.change(caption, { target: { value: "Strike on the front " } });
    fireEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    await waitFor(() => expect(createContribution).toHaveBeenCalled());
    const payload = (createContribution as jest.Mock).mock.calls[0][0] as FormData;
    expect(JSON.parse(String(payload.get(`${kind}_image_descriptions`)))).toEqual(["Strike on the front"]);
  },
);

it("shows a caption saved with a resumed Marking draft", async () => {
  resumeDraft("marking", {
    marking_image_metas: [{ storage_filename: "va/mine.png", image_description: "Back of the cover" }],
  });
  expect(await screen.findByText("Back of the cover", {}, { timeout: 5000 })).toBeTruthy();
});

it("captions only the gallery images that have a description", () => {
  const image = { isDefault: false, isTracing: false, imageId: null };
  const { container } = render(<TooltipProvider><EntryImageGalleryCard
    images={[
      { ...image, imageUrl: "/media/a.png", description: "Front" },
      { ...image, imageUrl: "/media/b.png", description: "" },
    ]}
    showSubjectBadge={false}
    carouselApi={undefined}
    setCarouselApi={() => {}}
    currentIndex={0}
  /></TooltipProvider>);
  expect(Array.from(container.querySelectorAll("figcaption"), (el) => el.textContent)).toEqual(["Front"]);
});
