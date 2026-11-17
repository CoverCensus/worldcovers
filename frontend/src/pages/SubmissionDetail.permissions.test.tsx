/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";
import {
  decideSubmission,
  getSubmission,
  getDirectCatalogCodeSuggestion,
  mapApiItemToSubmission,
} from "@/services/submissions";
import SubmissionDetail from "./SubmissionDetail";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("embla-carousel-react", () => ({ __esModule: true, default: () => [jest.fn(), undefined] }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorks: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  normalizeImageUrl: (value: string) => value,
  getMarkingListImageUrl: () => null,
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, town: "Burlington", state: "VT" }),
}));
jest.mock("@/services/submissions", () => ({
  ...jest.requireActual("@/services/submissions"),
  getSubmission: jest.fn(),
  decideSubmission: jest.fn().mockResolvedValue({ markingId: 7 }),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "APMC-VT-M0001" }),
}));

const editor: AuthUser = {
  id: 48,
  username: "test-editor",
  email: "editor@example.com",
  role: "editor",
  is_staff: false,
  assigned_collections: [{ id: 100, name: "Vermont", region: { id: 200, name: "Vermont", abbrev: "VT" } }],
};

beforeEach(() => jest.clearAllMocks());

it("shows the Cover scan and sends the identified office on Marking approval", async () => {
  (useAuth as jest.Mock).mockReturnValue(editor);
  (getSubmission as jest.Mock).mockResolvedValue(mapApiItemToSubmission({
    id: 9310, collection: 100, contributor: 7, status: "pending",
    submitted_data: { submission_kind: "marking", type: "RATEMARK", requires_catalog_office: true,
      catalog_code: "FPHC2-M-0001", inscription_txt: "Sh 26",
      cover_image_metas: [{ storage_filename: "fl/scan.png", original_filename: "scan.png" }] },
  }));
  render(<TooltipProvider><MemoryRouter initialEntries={["/submission/9310"]}>
    <Routes><Route path="/submission/:id" element={<SubmissionDetail />} /></Routes>
  </MemoryRouter></TooltipProvider>);
  const field = await screen.findByLabelText("Post Office catalog code");
  expect(screen.getByAltText("scan.png").getAttribute("src")).toContain("fl/scan.png");
  const approve = screen.getByRole("button", { name: "Approve" });
  expect(approve.hasAttribute("disabled")).toBe(true);
  fireEvent.change(field, { target: { value: "OFFICE-1" } });
  fireEvent.click(approve);
  await waitFor(() => expect(decideSubmission).toHaveBeenCalledWith(9310, "approve",
    expect.objectContaining({ catalogCode: "FPHC2-M-0001", officeCode: "OFFICE-1" })));
});

describe.each(["marking", "cover"])("%s Submission review permissions", (kind) => {
  it("keeps known details readable and prevents approval of unrecognized fields", async () => {
    (useAuth as jest.Mock).mockReturnValue(editor);
    (getSubmission as jest.Mock).mockResolvedValue(mapApiItemToSubmission({
      id: 9327, collection: 100, contributor: editor.id, status: "pending",
      submitted_data: {
        submission_kind: kind, type: kind === "cover" ? "FL" : "TOWNMARK",
        description: "Recognized submitted description", new_field: "Unrecognized content",
        ...(kind === "cover" ? { parent_marking_id: 7 } : {}),
      },
    }));
    render(<TooltipProvider><MemoryRouter initialEntries={["/submission/9327"]}>
      <Routes><Route path="/submission/:id" element={<SubmissionDetail />} /></Routes>
    </MemoryRouter></TooltipProvider>);
    await screen.findByText("Recognized submitted description");
    expect(screen.getByRole("alert").textContent).toContain("Approval is unavailable");
    expect(screen.getByRole("button", { name: "Approve" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Return" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(/Failed to render submitted data/)).toBeNull();
  });

  const cases: { name: string; user: AuthUser | null; collection: number | null; status?: string; allowed: boolean }[] = [
    { name: "assigned Editor", user: editor, collection: 100, allowed: true },
    { name: "unassigned Editor viewing their own Submission", user: editor, collection: 200, allowed: false },
    { name: "Editor with no assignments", user: { ...editor, assigned_collections: [] }, collection: 100, allowed: false },
    { name: "Submission with no Collection", user: editor, collection: null, allowed: false },
    { name: "Contributor", user: { ...editor, role: "contributor" }, collection: 100, allowed: false },
    { name: "Guest", user: null, collection: 100, allowed: false },
    { name: "Administrator outside assigned Collections", user: { ...editor, role: "administrator" }, collection: 300, allowed: true },
    { name: "Superuser", user: { ...editor, is_superuser: true }, collection: 300, allowed: true },
    { name: "approved Submission", user: editor, collection: 100, status: "approved", allowed: false },
    { name: "draft Submission", user: editor, collection: 100, status: "draft", allowed: false },
  ];

  it.each(cases)("shows review controls only when permitted: $name", async ({ user, collection, status, allowed }) => {
    (useAuth as jest.Mock).mockReturnValue(user);
    (getSubmission as jest.Mock).mockResolvedValue(mapApiItemToSubmission({
      id: 9327,
      collection,
      contributor: editor.id,
      contributor_username: editor.username,
      status: status ?? "pending",
      submitted_data: {
        submission_kind: kind,
        type: kind === "cover" ? "FL" : "TOWNMARK",
        state: "VT",
        town: "Burlington",
        inscription_txt: "STAGING TEST",
        ...(kind === "cover" ? { parent_marking_id: 7 } : {}),
      },
    }));

    render(<TooltipProvider><MemoryRouter initialEntries={["/submission/9327"]}>
      <Routes><Route path="/submission/:id" element={<SubmissionDetail />} /></Routes>
    </MemoryRouter></TooltipProvider>);

    await screen.findByText(/Submission Details|Cover Details/i);
    for (const name of ["Approve", "Reject", "Return"]) {
      expect(screen.queryByRole("button", { name }) !== null).toBe(allowed);
    }
    expect(screen.queryByLabelText(/Catalog (Marking|Cover) code/) !== null).toBe(allowed);
    if (allowed) {
      await waitFor(() => expect(getDirectCatalogCodeSuggestion).toHaveBeenCalled());
    } else {
      expect(getDirectCatalogCodeSuggestion).not.toHaveBeenCalled();
    }
  });
});
