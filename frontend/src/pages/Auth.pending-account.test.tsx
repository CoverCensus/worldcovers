/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import Auth from "./Auth";
import apiClient from "@/lib/api";

const mockToast = jest.fn();

jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/auth", () => ({
  getStoredUser: () => null,
  setStoredUser: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ensureCsrfToken: jest.fn().mockResolvedValue(undefined),
}));

const mockPost = apiClient.post as jest.Mock;

// The exact sentence the backend returns for a pending account. The whole point
// of the assertion below is that the SPA does not paraphrase, truncate or
// replace it -- issue #150 was reported because the user was shown a message
// that did not describe their actual problem.
const PENDING_DETAIL =
  "This account is waiting for approval, so it cannot sign in yet. This is not a " +
  "password problem - resetting your password will not change it. Email " +
  "info@worldcovers.org if you would like it looked at.";

describe("Auth page — a pending account is told the truth (issue #150)", () => {
  beforeEach(() => {
    mockToast.mockClear();
    mockPost.mockReset();
  });

  it("shows the server's account-state message verbatim instead of its own copy", async () => {
    // lib/api's interceptor collapses a DRF body to Error(detail), so this is
    // what the page actually receives for a 403.
    mockPost.mockRejectedValue(new Error(PENDING_DETAIL));

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    // Exact labels: /password/i also matches the show/hide toggle's aria-label
    // and the "Forgot password?" link.
    await user.type(await screen.findByLabelText("Email"), "pending@example.com");
    await user.type(screen.getByLabelText("Password"), "whatever");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());

    const { description } = mockToast.mock.calls[0][0];
    expect(description).toBe(PENDING_DETAIL);
    expect(description).not.toMatch(/invalid credentials/i);
  });
});
