/**
 * @jest-environment jsdom
 */
// Trello T99: the About page explains the catalog and the Society and ends in the Support block.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import About from "./About";
import { DONATE_URL, ORG_NAME, ORG_URL } from "@/constants/brand";

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null }));
jest.mock("@/hooks/useSiteInfo", () => ({ useSiteInfo: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/ChangePasswordForm", () => ({ ChangePasswordForm: () => null }));

describe("About page (T99)", () => {
  beforeAll(() => {
    (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
  });

  it("names the catalog, links to the Society, and carries the Support block", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <About />
      </MemoryRouter>,
    );
    screen.getByRole("heading", { name: "About the APMC" });
    screen.getByRole("heading", { name: "Support the APMC" });
    const societyLinks = screen.getAllByRole("link", { name: ORG_NAME });
    expect(societyLinks.length).toBeGreaterThan(0);
    societyLinks.forEach((link) => expect(link.getAttribute("href")).toBe(ORG_URL));
    expect(screen.getByRole("link", { name: "Donate via PayPal" }).getAttribute("href")).toBe(DONATE_URL);
    expect(screen.getByRole("link", { name: "getting started guide" }).getAttribute("href")).toBe(
      "/help/getting-started",
    );
  });
});
