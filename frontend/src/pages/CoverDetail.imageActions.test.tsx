/** @jest-environment jsdom */
/**
 * Workspace issues.md #180 / Trello T37 -- the cover screen must keep
 * "Move to marking" on screen for an editor and disable it with a reason when
 * the cover has no associated Marking, instead of hiding it (issues.md 166).
 *
 * Mocks follow CoverDetail.linking.test.tsx, minus its stub of the thumbnails
 * card: this test needs the real card to see the control.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CoverDetailPage from "./CoverDetail";
import { useAuth } from "@/hooks/useAuth";
import { getCoverMarkingsByCover, loadAssociatedMarkingsForCover } from "@/services/markings";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
// Unlike the linking test, render both columns: the thumbnails card lives in
// the left one.
jest.mock("@/components/entry-detail/EntryDetailLayout", () => ({
  EntryDetailLayout: ({ leftColumn, rightColumn }: { leftColumn: React.ReactNode; rightColumn: React.ReactNode }) => (
    <div>{leftColumn}{rightColumn}</div>
  ),
}));
jest.mock("@/components/entry-detail/EntryImageGalleryCard", () => ({ EntryImageGalleryCard: () => null }));
jest.mock("@/components/entry-detail/EntryRecordHistoryCard", () => ({ EntryRecordHistoryCard: () => null }));
jest.mock("@/components/entry-detail/EntryCitationsCard", () => ({ EntryCitationsCard: () => null }));
jest.mock("@/components/entry-detail/CoverRecordDetailFields", () => ({ CoverRecordDetailFields: () => null }));
jest.mock("@/components/entry-detail/AssociatedMarkingPreviewCard", () => ({ AssociatedMarkingPreviewCard: () => null }));
jest.mock("@/components/AdminEditLink", () => ({ AdminEditLink: () => null }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/services/markings", () => ({
  getImagesForSubject: jest.fn().mockResolvedValue([
    {
      imageId: 10916,
      subjectType: "COVER",
      subjectId: 7,
      imageUrl: "/media/fl/scan.jpg",
      imageView: "FRONT",
      originalFilename: "scan.jpg",
      storageFilename: "fl/scan.jpg",
      imageDescription: "",
      isTracing: false,
      displayOrder: 0,
      imageWidth: 800,
      imageHeight: 500,
    },
  ]),
  getCoverMarkingsByCover: jest.fn(),
  loadAssociatedMarkingsForCover: jest.fn(),
  getMarkingsPage: jest.fn().mockResolvedValue({ results: [], count: 0, next: null }),
  getMarkingListImageUrl: () => null,
  normalizeImageUrl: (value: string) => value,
}));
jest.mock("@/services/covers", () => ({
  getCoverById: jest.fn().mockResolvedValue({
    id: 7, code: "ASCC6-FL-C1143", isRemoved: false,
    datesSeen: [], isInstitutional: null, images: [],
  }),
  createCoverMarking: jest.fn(),
}));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorks: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn().mockResolvedValue([]) }));

const links = getCoverMarkingsByCover as jest.Mock;
const markings = loadAssociatedMarkingsForCover as jest.Mock;
const auth = useAuth as jest.Mock;

const approvedLink = { id: 2, coverId: 7, markingId: 42, isBackstamp: false, reviewStatus: "approved", reviewNotes: null };
const marking = {
  id: 42, code: "ASCC6-FL-M42", type: "TOWNMARK", town: "Benton", state: "Florida", stateAbbrev: "FL",
  postOfficeName: "Benton", inscriptionTxt: "BENTON", shapeName: "Circle", colorName: "Black", images: [],
};

function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/covers/7"]}>
        <Routes><Route path="/covers/:coverId" element={<CoverDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Cover page image actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockReturnValue({ role: "editor", user: { id: 1 } });
  });

  it("keeps Move to marking visible and disabled with a reason when no Marking is linked", async () => {
    links.mockResolvedValue({ links: [], error: null });
    markings.mockResolvedValue([]);
    openPage();
    const move = await screen.findByRole("button", { name: "Move to marking" });
    expect(move.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/no associated Marking/)).toBeTruthy();
  });

  it("enables Move to marking once a Marking is linked", async () => {
    links.mockResolvedValue({ links: [approvedLink], error: null });
    markings.mockResolvedValue([{ link: approvedLink, marking, defaultImageUrl: null }]);
    openPage();
    // The association load resolves after first paint; wait for the enabled state.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move to marking" }).hasAttribute("disabled")).toBe(false),
    );
    expect(screen.queryByText(/no associated Marking/)).toBeNull();
  });
});
