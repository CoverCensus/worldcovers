/**
 * @jest-environment jsdom
 */
// Trello T69 -- the footer's rights sentence stays as written and points at the Help article.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null }));

import { Footer } from "./Footer";

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
});
