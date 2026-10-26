/**
 * @jest-environment jsdom
 */
// Trello T84 -- on the test site the "Create account" path points at production;
// on production it opens the request dialog as before.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null, useAuthState: () => ({ user: null, status: "guest", error: null }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/components/ForgotPasswordForm", () => ({ ForgotPasswordForm: () => null }));
jest.mock("@/components/RequestLoginForm", () => ({
  RequestLoginForm: ({ open }: { open: boolean }) => (open ? <div role="dialog">request dialog</div> : null),
}));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/api", () => ({ __esModule: true, default: { post: jest.fn() }, ensureCsrfToken: jest.fn() }));

let mockSite: { isProduction: boolean; productionUrl: string; productionHost: string } | null = null;
jest.mock("@/hooks/useSiteInfo", () => ({ useSiteInfo: () => mockSite }));

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

describe("Auth page request path (T84)", () => {
  afterEach(() => {
    mockSite = null;
    window.localStorage.clear();
  });

  it("on the test site links to production and does not open the local request form", () => {
    mockSite = { isProduction: false, productionUrl: "https://hellowoco.app", productionHost: "hellowoco.app" };
    renderAuth();

    const link = screen.getByRole("link", { name: "Create an account on hellowoco.app" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://hellowoco.app/auth");
    expect(screen.getByRole("note").textContent).toContain("This is the test site");
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("on production opens the request dialog", () => {
    mockSite = { isProduction: true, productionUrl: "https://hellowoco.app", productionHost: "hellowoco.app" };
    renderAuth();

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("link", { name: /Create an account on/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    screen.getByRole("dialog");
  });

  it("does not allow local signup before the site is known", () => {
    mockSite = null;
    renderAuth();

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
    screen.getByRole("button", { name: /Retry/ });
  });
});
