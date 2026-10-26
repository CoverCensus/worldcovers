/**
 * @jest-environment jsdom
 */
// Trello T71 -- editor controls on the Post Office page; anonymous view unchanged.
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import PostOfficeDetail from "./PostOfficeDetail";
import apiClient from "@/lib/api";
import { getTenuresForPostOffice, updateTenure, type PostmasterTenure } from "@/services/postmasters";

let mockUser: { id: number; role: string } | null = null;
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUser }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));
jest.mock("@/services/postmasters", () => ({
  ...jest.requireActual("@/services/postmasters"),
  getTenuresForPostOffice: jest.fn(),
  searchPostmasters: jest.fn().mockResolvedValue([]),
  createTenure: jest.fn(),
  updateTenure: jest.fn(),
}));

const imported: PostmasterTenure = {
  id: 1, postOfficeId: 7, postOfficeName: "Richmond", postmasterId: 3, postmasterName: "Gerrard T. Conn",
  event: "appointment", dateAppointed: "1793-04-25", granularity: "DAY", sourceRef: "T3:r15904",
  origin: "IMPORT", sourceNote: "",
};
const manual: PostmasterTenure = {
  id: 2, postOfficeId: 7, postOfficeName: "Richmond", postmasterId: 4, postmasterName: "Jane Roe",
  event: "appointment", dateAppointed: "1801-01-01", granularity: "YEAR", sourceRef: "",
  origin: "MANUAL", sourceNote: "Register, p. 12",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/post-office/7"]}>
          <Routes>
            <Route path="/post-office/:id" element={<PostOfficeDetail />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    data: { id: 7, name: "Richmond", code: "VA-RIC", population: null, region_name: "Virginia", region_abbrev: "VA" },
  });
  (getTenuresForPostOffice as jest.Mock).mockResolvedValue([imported, manual]);
});

describe("PostOfficeDetail", () => {
  it("shows the succession to anyone and no editing controls to a visitor", async () => {
    mockUser = null;
    renderPage();
    expect(await screen.findByText("Gerrard T. Conn")).toBeInTheDocument();
    expect(screen.getByText("Jane Roe")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    expect(screen.getByText(/Source: Register, p\. 12/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add postmaster event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  });

  it("lets an editor add an event and correct an imported row", async () => {
    mockUser = { id: 5, role: "editor" };
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("button", { name: "Add postmaster event" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit Gerrard T\. Conn 1793-04-25/ }));
    expect(screen.getByRole("form", { name: "Edit postmaster event" })).toBeInTheDocument();
    expect(screen.getByText(/Imported row; your correction is logged/)).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toHaveValue("1793");
    // Only one form at a time: the add button hides while a row is being edited.
    expect(screen.queryByRole("button", { name: "Add postmaster event" })).not.toBeInTheDocument();

    (updateTenure as jest.Mock).mockResolvedValue({ ...imported, sourceNote: "Checked against the 1794 register" });
    const fetchesBeforeSave = (getTenuresForPostOffice as jest.Mock).mock.calls.length;
    await user.type(screen.getByRole("textbox", { name: /Source note/ }), "Checked against the 1794 register");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateTenure).toHaveBeenCalledWith(1, expect.objectContaining({
      post_office: 7, postmaster: 3, source_note: "Checked against the 1794 register",
    })));
    // Saving refetches the list and closes the form.
    await waitFor(() =>
      expect((getTenuresForPostOffice as jest.Mock).mock.calls.length).toBeGreaterThan(fetchesBeforeSave),
    );
    await waitFor(() => expect(screen.queryByRole("form", { name: "Edit postmaster event" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add postmaster event" })).toBeInTheDocument();
  });
});
