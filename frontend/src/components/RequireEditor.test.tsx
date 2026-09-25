/**
 * @jest-environment jsdom
 */
// issues.md 177 — the roster carries email addresses, so the route is for
// editors and administrators only. Contributors go to their dashboard, guests
// to login, exactly as RequireSuperuser does for admin routes.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireEditor } from "./RequireEditor";
import { useAuth } from "@/hooks/useAuth";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
const mockedUseAuth = useAuth as jest.Mock;

function renderAt(path = "/editors") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
        <Route
          path="/editors"
          element={
            <RequireEditor>
              <div>roster page</div>
            </RequireEditor>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireEditor", () => {
  it("sends a guest to login", () => {
    mockedUseAuth.mockReturnValue(null);
    renderAt();
    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("sends a contributor to the dashboard", () => {
    mockedUseAuth.mockReturnValue({ id: 1, username: "c", email: "", is_staff: false, role: "contributor" });
    renderAt();
    expect(screen.getByText("dashboard page")).toBeTruthy();
  });

  it("lets an editor and an administrator through", () => {
    mockedUseAuth.mockReturnValue({ id: 2, username: "e", email: "", is_staff: false, role: "editor" });
    renderAt();
    expect(screen.getByText("roster page")).toBeTruthy();
    mockedUseAuth.mockReturnValue({ id: 3, username: "a", email: "", is_staff: true, is_superuser: true });
    renderAt();
    expect(screen.getAllByText("roster page").length).toBeGreaterThan(0);
  });
});
