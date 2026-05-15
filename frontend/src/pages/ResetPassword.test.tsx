import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPassword from "./ResetPassword";

const mockNavigate = jest.fn();
const mockToast = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, setStoredUser: jest.fn() };
});

describe("ResetPassword page", () => {
  const renderPage = (search = "?uid=abc&token=xyz") =>
    render(
      <MemoryRouter
        initialEntries={[`/reset-password${search}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Invalid token" }),
    } as Response);
  });

  it("renders the reset password form", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /reset password/i });
    await waitFor(() => expect(submitBtn).toBeDisabled());
  });

  it("shows validation error when password is too short", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.tab();
    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
  });

  it("shows validation error when passwords do not match", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password$/i), "Password1!");
    await user.type(screen.getByLabelText(/^confirm password$/i), "Different1!");
    await user.tab();
    expect(
      await screen.findByText(/passwords do not match/i),
    ).toBeInTheDocument();
  });

  it("shows toast and does not navigate when API returns error", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password$/i), "Password1!");
    await user.type(screen.getByLabelText(/^confirm password$/i), "Password1!");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reset password/i })).not.toBeDisabled()
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Unable to reset password", variant: "destructive" }),
      )
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates home on successful password reset", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ detail: "Password updated successfully" }),
    } as Response);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password$/i), "Password1!");
    await user.type(screen.getByLabelText(/^confirm password$/i), "Password1!");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reset password/i })).not.toBeDisabled()
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Password updated" }),
      )
    );
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows toast and disables submit when uid or token is missing", async () => {
    renderPage("?uid=&token=");
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invalid reset link", variant: "destructive" }),
      )
    );
    expect(screen.getByRole("button", { name: /reset password/i })).toBeDisabled();
  });
});
