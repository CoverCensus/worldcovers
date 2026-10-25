/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Navigation } from "./Navigation";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, ORG_NAME, ORG_URL } from "@/constants/brand";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/ChangePasswordForm", () => ({ ChangePasswordForm: () => null }));

const mockedUseAuth = useAuth as jest.Mock;

describe("Navigation branding (T98)", () => {
  beforeEach(() => mockedUseAuth.mockReturnValue(null));

  it("shows the Society seal with its name as alt text and the APMC name", () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>,
    );
    const seal = screen.getByRole("img", { name: ORG_NAME });
    expect(seal.getAttribute("src")).toBeTruthy();
    expect(screen.getByText(APP_NAME)).toBeTruthy();
    // T99: the seal opens the Society's site in a new tab; the name still goes home.
    const society = screen.getByRole("link", { name: `${ORG_NAME} website` });
    expect(society.getAttribute("href")).toBe(ORG_URL);
    expect(society.getAttribute("target")).toBe("_blank");
    expect(society.getAttribute("rel")).toContain("noopener");
    expect(society.contains(seal)).toBe(true);
    const home = screen.getByRole("link", { name: `${APP_NAME} home` });
    expect(home.getAttribute("href")).toBe("/");
    expect(home.textContent).toBe(APP_NAME);
    // The name must stay visible on phones: it is the only header tap that goes home.
    expect(home.className).not.toContain("hidden");
  });

  it("no longer renders the old WorldCovers name or the W tile", () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>,
    );
    expect(screen.queryByText("WorldCovers")).toBeNull();
    expect(screen.queryByText("W")).toBeNull();
  });
});
