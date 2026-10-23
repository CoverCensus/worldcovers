/** @jest-environment jsdom */
/**
 * Trello T74: an editor restores a Cover version from Record History after
 * reading the preview; the page then reloads the cover and its history.
 * Mocks follow CoverDetail.imageActions.test.tsx but keep the real history
 * card and restore dialog, which hold the controls under test.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CoverDetailPage from "./CoverDetail";
import { useAuth } from "@/hooks/useAuth";
import {
  getCoverChangelog, getCoverMarkingsByCover, getCoverRestorePreview, loadAssociatedMarkingsForCover,
  restoreCoverVersion,
} from "@/services/markings";
import { getCoverById } from "@/services/covers";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/components/entry-detail/EntryDetailLayout", () => ({
  EntryDetailLayout: ({ leftColumn, rightColumn }: { leftColumn: React.ReactNode; rightColumn: React.ReactNode }) => (
    <div>{leftColumn}{rightColumn}</div>
  ),
}));
jest.mock("@/components/entry-detail/EntryImageGalleryCard", () => ({ EntryImageGalleryCard: () => null }));
jest.mock("@/components/entry-detail/EntryAssociatedThumbnailsCard", () => ({ EntryAssociatedThumbnailsCard: () => null }));
jest.mock("@/components/entry-detail/EntryCitationsCard", () => ({ EntryCitationsCard: () => null }));
jest.mock("@/components/entry-detail/CoverRecordDetailFields", () => ({ CoverRecordDetailFields: () => null }));
jest.mock("@/components/entry-detail/AssociatedMarkingPreviewCard", () => ({ AssociatedMarkingPreviewCard: () => null }));
jest.mock("@/components/AdminEditLink", () => ({ AdminEditLink: () => null }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/services/markings", () => ({
  getCoverChangelog: jest.fn().mockResolvedValue({
    id: 7,
    events: [{
      event_id: 1, transaction_uuid: "u", timestamp: "2026-10-01T12:00:00Z", action: "approve",
      action_label: "Approved", actor: "editor", actor_email: "editor@example.com", source: "editor_portal",
      contribution_id: null, version_no: 2, summary: "Approved by editor", diff: [],
    }],
    versions: [],
  }),
  getCoverRestorePreview: jest.fn().mockResolvedValue({
    ok: true,
    preview: {
      entry_type: "cover", entry_id: 7, version_no: 2, version_created_at: null, version_action_label: "Approved",
      fields: [{ key: "type", label: "Type", current: "Folded cover", proposed: "Folded letter", changed: true }],
      relationships: { valuations: { added: 1, removed: 0, kept: 0, skipped: 0 } },
      limitations: [],
      has_changes: true,
    },
  }),
  restoreCoverVersion: jest.fn().mockResolvedValue({ ok: true, detail: "Record restored from version 2.", newVersionNo: 3, limitations: [] }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
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

function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {/* Opened from a marking record: the history card is unavailable on the bare /covers/:coverId route. */}
      <MemoryRouter initialEntries={["/record/42/cover/7"]}>
        <Routes><Route path="/record/:id/cover/:coverId" element={<CoverDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("previews, confirms and reloads the cover and its history", async () => {
  (useAuth as jest.Mock).mockReturnValue({ role: "editor", user: { id: 1 } });
  (getCoverMarkingsByCover as jest.Mock).mockResolvedValue({ links: [], error: null });
  (loadAssociatedMarkingsForCover as jest.Mock).mockResolvedValue([]);
  openPage();
  await waitFor(() => expect(getCoverChangelog).toHaveBeenCalledWith(7));
  fireEvent.click(await screen.findByRole("button", { name: /Restore this version/ }));
  await waitFor(() => expect(getCoverRestorePreview).toHaveBeenCalledWith(7, 2));
  expect(await screen.findByText(/1 of 1 fields change/)).toBeTruthy();
  const coverLoads = (getCoverById as jest.Mock).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Restore from version 2" }));
  await waitFor(() => expect(restoreCoverVersion).toHaveBeenCalledWith(7, 2));
  await waitFor(() => expect(getCoverChangelog).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((getCoverById as jest.Mock).mock.calls.length).toBe(coverLoads + 1));
});
