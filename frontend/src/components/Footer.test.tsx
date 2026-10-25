/**
 * @jest-environment jsdom
 */
// Trello T69 -- the footer's rights sentence stays as written and points at the Help article.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null }));

// T84: the footer carries a "Test site" badge when the server says this is not production.
let mockSite: { isProduction: boolean } | null = null;
jest.mock("@/hooks/useSiteInfo", () => ({ useSiteInfo: () => mockSite }));

import { Footer } from "./Footer";
import { DONATE_URL } from "@/constants/brand";

describe("Footer", () => {
  beforeAll(() => {
    // Vite injects __APP_VERSION__ at build time; jest has no define step.
    (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
  });

  it("keeps the CC BY 4.0 sentence and links to Rights and attribution", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    // getByText throws when the sentence is missing or altered.
    screen.getByText(/All catalog data is freely available under CC BY 4\.0\./);
    const link = screen.getByRole("link", { name: "Rights and attribution" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/help/rights-and-attribution");
  });

  it("marks the test site, and only the test site", () => {
    mockSite = { isProduction: false };
    const { unmount } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    screen.getByText("Test site");
    unmount();

    mockSite = { isProduction: true };
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Test site")).toBeNull();
  });

  it("links to About and to the Society's PayPal donate page (T99)", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "About" }).getAttribute("href")).toBe("/about");
    const donate = screen.getByRole("link", { name: "Donate" });
    expect(donate.getAttribute("href")).toBe(DONATE_URL);
    expect(donate.getAttribute("target")).toBe("_blank");
    expect(donate.getAttribute("rel")).toContain("noopener");
  });
});
