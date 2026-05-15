import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

const mockNavigate = jest.fn();
const mockToast = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

jest.mock("@/services/markings", () => ({
  normalizeImageUrl: (u: string | null) => u,
  getAssignedCatalogPage: jest.fn(),
}));

jest.mock("@/hooks/useFilterOptions", () => ({
  useFilterOptions: () => ({
    states: [],
    shapes: [],
    colors: [],
  }),
}));

const renderDashboard = (initialTab?: "submissions" | "suggestions" | "editor") =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard initialTab={initialTab} />
    </MemoryRouter>,
  );

describe("Dashboard page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockUseAuth.mockReturnValue({ id: 1, username: "testuser", email: "test@test.com", is_staff: false });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, results: [], page: 1, page_size: 10 }),
    } as unknown as Response);
  });

  it("renders the main dashboard heading", async () => {
    renderDashboard();
    expect(
      await screen.findByRole("heading", { name: /contributor dashboard/i }),
    ).toBeInTheDocument();
  });

  it("shows submissions label text for editor users", async () => {
    // Tab buttons only appear for editors
    mockUseAuth.mockReturnValue({ id: 1, username: "editor", email: "e@t.com", is_staff: false, role: "editor" });
    renderDashboard();
    expect(await screen.findByText(/my submissions/i)).toBeInTheDocument();
  });

  it("shows empty state when API returns no submissions", async () => {
    renderDashboard();
    expect(
      await screen.findByText(/you haven't submitted anything yet/i),
    ).toBeInTheDocument();
  });

  it("shows submission card name when API returns item list", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 101,
          submitted_data: { name: "Test Mark", town: "Springfield", state: "IL" },
          status: "pending",
          created_at: "2025-01-01T00:00:00Z",
          marking_id: null,
        },
      ],
    } as unknown as Response);
    renderDashboard();
    // displayName is built from town+state since no display_name field
    expect(await screen.findByText(/Springfield, IL/i)).toBeInTheDocument();
  });

  it("shows error toast when API fetch fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
    renderDashboard();
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      )
    );
  });

  it("shows user submissions tab for editor users", async () => {
    mockUseAuth.mockReturnValue({ id: 1, username: "editor", email: "e@t.com", is_staff: false, role: "editor" });
    renderDashboard();
    expect(await screen.findByText(/user submissions/i)).toBeInTheDocument();
  });

  it("does not show editor-only tab labels for regular contributors", async () => {
    mockUseAuth.mockReturnValue({ id: 1, username: "contrib", email: "c@t.com", is_staff: false });
    renderDashboard();
    await screen.findByRole("heading", { name: /contributor dashboard/i });
    expect(screen.queryByRole("button", { name: /user submissions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my submissions/i })).not.toBeInTheDocument();
  });
});
