/**
 * @jest-environment jsdom
 */
// Trello T99: Donate sits at the right of the header on every page, desktop and
// mobile, for guests and signed-in users; About joins the nav.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Navigation } from "./Navigation";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/lib/auth";
import { DONATE_URL } from "@/constants/brand";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/ChangePasswordForm", () => ({ ChangePasswordForm: () => null }));

const mockedUseAuth = useAuth as jest.Mock;
const member: AuthUser = {
  id: 2,
  username: "member",
  email: "",
  is_staff: false,
  is_superuser: false,
  role: "contributor",
};

function renderNavigation(user: AuthUser | null) {
  mockedUseAuth.mockReturnValue(user);
  return render(
    <MemoryRouter>
      <Navigation />
    </MemoryRouter>,
  );
}

function expectDonateLink(link: HTMLElement) {
  expect(link.getAttribute("href")).toBe(DONATE_URL);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noopener");
}

describe("Navigation Donate and About (T99)", () => {
  it.each([
    ["a guest", null],
    ["a signed-in member", member],
  ])("shows one Donate link to PayPal on desktop for %s", (_label, user) => {
    renderNavigation(user);
    const links = screen.getAllByRole("link", { name: "Donate" });
    expect(links).toHaveLength(1);
    expectDonateLink(links[0]);
  });

  it("repeats Donate and About in the mobile menu", () => {
    const { container } = renderNavigation(null);
    const toggle = container.querySelector("button.md\\:hidden");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle as Element);
    const donate = screen.getAllByRole("link", { name: "Donate" });
    expect(donate).toHaveLength(2);
    donate.forEach(expectDonateLink);
    const about = screen.getAllByRole("link", { name: "About" });
    expect(about).toHaveLength(2);
    about.forEach((link) => expect(link.getAttribute("href")).toBe("/about"));
  });

  it("keeps About between Catalog and Help", () => {
    renderNavigation(null);
    const names = screen
      .getAllByRole("link")
      .map((link) => link.textContent?.trim())
      .filter((name) => ["Home", "Catalog", "About", "Help", "Login", "Donate"].includes(name ?? ""));
    expect(names).toEqual(["Home", "Catalog", "About", "Help", "Login", "Donate"]);
  });
});
