/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/ChangePasswordForm", () => ({ ChangePasswordForm: () => null }));

const mockedUseAuth = useAuth as jest.Mock;
const staff: AuthUser = {
  id: 1,
  username: "staff",
  email: "",
  is_staff: true,
  is_superuser: false,
  role: "editor",
};

function DashboardState() {
  const location = useLocation();
  return <div data-testid="dashboard-state">{String(location.state?.tab)}</div>;
}

function renderNavigation(user: AuthUser | null) {
  mockedUseAuth.mockReturnValue(user);
  return render(
    <MemoryRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<div />} />
        <Route path="/dashboard" element={<DashboardState />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openMobileMenu(container: HTMLElement) {
  const toggle = container.querySelector("button.md\\:hidden");
  expect(toggle).not.toBeNull();
  fireEvent.click(toggle!);
}

describe("Navigation Admin Panel", () => {
  it("puts the staff link before Dashboard in the desktop dropdown", async () => {
    renderNavigation(staff);
    await userEvent.click(screen.getByRole("button", { name: /staff/i }));

    const admin = screen.getByRole("menuitem", { name: "Admin Panel" });
    const dashboard = screen.getByRole("menuitem", { name: "Dashboard" });
    expect(admin.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(admin.getAttribute("href")).toBe("/admin/");
    expect(admin.hasAttribute("target")).toBe(false);

    await userEvent.click(dashboard);
    expect(screen.getByTestId("dashboard-state").textContent).toBe("editor");
  });

  it("puts the staff link before Dashboard in the mobile account section", () => {
    const { container } = renderNavigation(staff);
    openMobileMenu(container);

    const admin = screen.getByRole("link", { name: "Admin Panel" });
    const dashboard = screen.getByRole("button", { name: "Dashboard" });
    expect(admin.compareDocumentPosition(dashboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(admin.getAttribute("href")).toBe("/admin/");
    expect(admin.hasAttribute("target")).toBe(false);

    admin.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(admin);
    expect(screen.queryByRole("button", { name: "Dashboard" })).toBeNull();

    openMobileMenu(container);
    const reopenedDashboard = screen.getByRole("button", { name: "Dashboard" });
    fireEvent.click(reopenedDashboard);
    expect(screen.getByTestId("dashboard-state").textContent).toBe("editor");
  });

  it("keeps My Submissions for staff without Editor access", async () => {
    renderNavigation({ ...staff, role: "contributor" });
    await userEvent.click(screen.getByRole("button", { name: /staff/i }));
    expect(screen.getByRole("menuitem", { name: "Admin Panel" })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "My Submissions" }));
    expect(screen.getByTestId("dashboard-state").textContent).toBe("submissions");
  });

  it.each([
    ["Contributor", { ...staff, is_staff: false, role: "contributor" }],
    ["Superuser without staff", { ...staff, is_staff: false, is_superuser: true, role: "administrator" }],
  ])("hides the shortcut for %s", async (_name, user) => {
    const { container } = renderNavigation(user);
    await userEvent.click(screen.getByRole("button", { name: /staff/i }));
    expect(screen.queryByRole("menuitem", { name: "Admin Panel" })).toBeNull();
    openMobileMenu(container);
    expect(screen.queryByRole("link", { name: "Admin Panel" })).toBeNull();
  });

  it("hides the shortcut for a Guest", () => {
    const { container } = renderNavigation(null);
    openMobileMenu(container);
    expect(screen.queryByText("Admin Panel")).toBeNull();
  });
});
