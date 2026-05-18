/**
 * Optional **real API** login check. Opt-in so `npm test` works offline / in CI without DNS.
 *
 * Add to `.env` (local only, never commit secrets):
 *   VITE_TEST_LOGIN_EMAIL=you@example.com
 *   VITE_TEST_LOGIN_PASSWORD=your-secret-password
 *   RUN_LIVE_AUTH_TEST=1
 *
 * Run: `npm run test:auth-live` (or `RUN_LIVE_AUTH_TEST=1 npm test`).
 * Requires network access to the API in `VITE_API_URL` / `VITE_API_BASE_URL`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

jest.setTimeout(30_000);

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const LIVE_EMAIL = (process.env.VITE_TEST_LOGIN_EMAIL ?? "").trim();
const LIVE_PASSWORD = (process.env.VITE_TEST_LOGIN_PASSWORD ?? "").trim();
const runLive =
  process.env.RUN_LIVE_AUTH_TEST === "1" && Boolean(LIVE_EMAIL && LIVE_PASSWORD);

(runLive ? describe : describe.skip)(
  "Auth page — live login (RUN_LIVE_AUTH_TEST=1 + VITE_TEST_LOGIN_EMAIL + VITE_TEST_LOGIN_PASSWORD)",
  () => {
    beforeEach(() => {
      localStorage.removeItem("worldcovers_user");
      mockNavigate.mockReset();
      mockToast.mockReset();
    });

    it("signs in with env credentials and stores user + navigates home", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Auth />
        </MemoryRouter>
      );

      await user.clear(screen.getByLabelText(/^email$/i));
      await user.type(screen.getByLabelText(/^email$/i), LIVE_EMAIL);
      await user.clear(screen.getByLabelText(/^password$/i));
      await user.type(screen.getByLabelText(/^password$/i), LIVE_PASSWORD);

      const submit = screen.getByRole("button", { name: /^sign in$/i });
      await waitFor(() => {
        expect(submit).not.toBeDisabled();
      });
      await user.click(submit);

      await waitFor(
        () => {
          const failed = mockToast.mock.calls.find(
            (c) => (c[0] as { title?: string })?.title === "Sign in failed"
          );
          if (failed) {
            throw new Error(
              `Login API failed: ${String((failed[0] as { description?: unknown }).description ?? failed[0])}`
            );
          }
          expect(mockNavigate).toHaveBeenCalledWith("/");
        },
        { timeout: 25_000 }
      );

      const raw = localStorage.getItem("worldcovers_user");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as { id: number; email?: string };
      expect(typeof parsed.id).toBe("number");

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Welcome back!" })
        );
      });
    });
  }
);
