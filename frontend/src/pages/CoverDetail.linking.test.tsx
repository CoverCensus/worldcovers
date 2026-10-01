/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CoverDetailPage from "./CoverDetail";
import { useAuth } from "@/hooks/useAuth";
import { getMarkingsPage, getCoverMarkingsByCover } from "@/services/markings";
import { createCoverMarking, getCoverById } from "@/services/covers";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/components/entry-detail/EntryDetailLayout", () => ({
  EntryDetailLayout: ({ rightColumn }: { rightColumn: React.ReactNode }) => <div>{rightColumn}</div>,
}));
jest.mock("@/components/entry-detail/EntryImageGalleryCard", () => ({ EntryImageGalleryCard: () => null }));
jest.mock("@/components/entry-detail/EntryAssociatedThumbnailsCard", () => ({ EntryAssociatedThumbnailsCard: () => null }));
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
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  getCoverMarkingsByCover: jest.fn(),
  loadAssociatedMarkingsForCover: jest.fn().mockResolvedValue([]),
  getMarkingsPage: jest.fn(),
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

const search = getMarkingsPage as jest.Mock;
const links = getCoverMarkingsByCover as jest.Mock;
const create = createCoverMarking as jest.Mock;
const auth = useAuth as jest.Mock;
const cover = getCoverById as jest.Mock;
const marking = {
  id: 42,
  code: "ASCC6-FL-M42",
  type: "TOWNMARK",
  town: "Benton",
  state: "Florida",
  stateAbbrev: "FL",
  postOfficeName: "Benton",
  inscriptionTxt: "BENTON",
  shapeName: "Circle",
  colorName: "Black",
  images: [],
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

describe("Cover linking search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockReturnValue({ role: "editor" });
    cover.mockResolvedValue({ id: 7, code: "ASCC6-FL-C1143", isRemoved: false, datesSeen: [], isInstitutional: null, images: [] });
    links.mockResolvedValue({ links: [], error: null });
    search.mockResolvedValue({ results: [marking], count: 1, next: null });
    create.mockResolvedValue({ id: 1, cover: 7, marking: 42 });
  });

  it("searches the catalog, selects a Marking, and sends one pending link", async () => {
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    expect(search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton Florida" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith(1, 10, expect.objectContaining({ search: "Benton Florida" })));
    fireEvent.click(await screen.findByRole("radio", { name: /ASCC6-FL-M42/ }));
    fireEvent.click(screen.getByText("Backstamp"));
    fireEvent.click(screen.getByText("Link Marking"));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ cover: 7, marking: 42, is_backstamp: true }));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shows an existing association and prevents another link", async () => {
    links.mockResolvedValue({ links: [{ id: 2, coverId: 7, markingId: 42, reviewStatus: "pending" }], error: null });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    const row = await screen.findByRole("radio", { name: /ASCC6-FL-M42/ });
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Linked: Pending review")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks linking when association loading fails", async () => {
    links.mockResolvedValue({ links: [], error: "read failed" });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    const row = await screen.findByRole("radio", { name: /ASCC6-FL-M42/ });
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("clears the selection when paging to another result", async () => {
    search.mockImplementation((page: number) => Promise.resolve({
      results: [page === 1 ? marking : { ...marking, id: 43, code: "ASCC6-FL-M43" }],
      count: 20,
      next: page === 1 ? "/next" : null,
    }));
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    fireEvent.click(await screen.findByRole("radio", { name: /ASCC6-FL-M42/ }));
    expect(screen.getByText("Link Marking").hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Link Marking").hasAttribute("disabled")).toBe(true);
    expect(await screen.findByRole("radio", { name: /ASCC6-FL-M43/ })).toBeTruthy();
    expect(search).toHaveBeenCalledWith(2, 10, expect.objectContaining({ search: "Benton" }));
  });

  it("keeps the selected Marking after a rejected link", async () => {
    create.mockRejectedValueOnce({ response: { data: { detail: "This cover is already linked to this marking." } } });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    fireEvent.click(await screen.findByRole("radio", { name: /ASCC6-FL-M42/ }));
    fireEvent.click(screen.getByText("Link Marking"));
    expect(await screen.findByText("This cover is already linked to this marking.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /ASCC6-FL-M42/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("retries a failed association read before allowing selection", async () => {
    links
      .mockResolvedValueOnce({ links: [], error: "read failed" })
      .mockResolvedValueOnce({ links: [], error: null });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    const row = await screen.findByRole("radio", { name: /ASCC6-FL-M42/ });
    expect(row.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("Retry associated Markings"));
    await waitFor(() => expect(row.hasAttribute("disabled")).toBe(false));
  });

  it("does not show a stale response after the query changes", async () => {
    let finishOld: ((value: unknown) => void) | undefined;
    search.mockImplementation((_page: number, _size: number, options: { search: string }) => {
      if (options.search === "Benton") {
        return new Promise((resolve) => { finishOld = resolve; });
      }
      return Promise.resolve({
        results: [{ ...marking, id: 43, code: "ASCC6-VA-M43", town: "Richmond" }],
        count: 1,
        next: null,
      });
    });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    await waitFor(() => expect(finishOld).toBeDefined());
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Richmond" } });
    finishOld?.({ results: [marking], count: 1, next: null });
    expect(screen.queryByRole("radio", { name: /ASCC6-FL-M42/ })).toBeNull();
    expect(await screen.findByRole("radio", { name: /ASCC6-VA-M43/ })).toBeTruthy();
  });

  it("does not repeat a saved link when the list refresh fails", async () => {
    links
      .mockResolvedValueOnce({ links: [], error: null })
      .mockResolvedValueOnce({ links: [], error: "refresh failed" });
    openPage();
    fireEvent.click(await screen.findByText("Link Existing Marking"));
    fireEvent.change(screen.getByLabelText("Search Markings"), { target: { value: "Benton" } });
    fireEvent.click(await screen.findByRole("radio", { name: /ASCC6-FL-M42/ }));
    fireEvent.click(screen.getByText("Link Marking"));
    expect(await screen.findByText("refresh failed")).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it.each([null, { role: "contributor" }])("hides linking for a Guest or Contributor", async (user) => {
    auth.mockReturnValue(user);
    openPage();
    await screen.findByText(/Associated Markings/);
    expect(screen.queryByText("Link Existing Marking")).toBeNull();
  });

  it("hides linking for a removed Cover", async () => {
    cover.mockResolvedValue({ id: 7, code: "ASCC6-FL-C1143", isRemoved: true, datesSeen: [], isInstitutional: null, images: [] });
    openPage();
    await screen.findByText(/Associated Markings/);
    expect(screen.queryByText("Link Existing Marking")).toBeNull();
  });
});
