import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Contribute from "./Contribute";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  getMarkingByIdRaw: jest.fn().mockResolvedValue(null),
  normalizeImageUrl: (u: string | null) => u,
}));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/framings", () => ({ getFramings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorks: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/postmarkEnums", () => ({ getDateFormats: jest.fn().mockReturnValue([]) }));

const renderPage = (route = "/contribute") =>
  render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/contribute" element={<Contribute />} />
      </Routes>
    </MemoryRouter>
  );

describe("Contribute page", () => {
  beforeEach(() => {
    mockToast.mockReset();
    mockUseAuth.mockReturnValue(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  it("renders contributor dashboard heading and submit card", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /contributor dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/submit new entry/i)).toBeInTheDocument();
  });

  it("shows sign-in helper message for guest users", async () => {
    renderPage();
    expect(
      await screen.findByText(/sign in to add your name to the submission/i)
    ).toBeInTheDocument();
  });

  it("shows sign-in required toast when guest clicks submit", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: /contributor dashboard/i });
    await user.click(screen.getByRole("button", { name: /submit postmark/i }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sign in required",
          variant: "destructive",
        }),
      );
    });
  });

  it("shows marking type validation when logged-in user submits empty form", async () => {
    mockUseAuth.mockReturnValue({
      id: 1,
      username: "contributor",
      email: "c@example.com",
      is_staff: false,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: /contributor dashboard/i });
    await user.click(screen.getByRole("button", { name: /submit postmark/i }));
    expect(await screen.findByText(/marking type is required/i)).toBeInTheDocument();
  });
});
