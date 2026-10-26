/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Auth from "./Auth";
import { signIn } from "@/services/account";

jest.mock("@/hooks/useAuth", () => ({ useAuth: () => null, useAuthState: () => ({ user: null, status: "guest", error: null }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useSiteInfo", () => ({ useSiteInfo: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/account", () => ({ signIn: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getStoredUser: () => null }));

async function login() {
  render(<MemoryRouter initialEntries={[{ pathname: "/auth", state: { from: "/contribute" } }]}>
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/contribute" element={<p>Contribution form</p>} />
    </Routes>
  </MemoryRouter>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email or username"), "collector");
  await user.type(screen.getByLabelText("Password"), "StrongPass1!");
  await user.click(screen.getByRole("button", { name: "Sign In" }));
}

it("shows a persistent verification notice instead of navigating", async () => {
  (signIn as jest.Mock).mockResolvedValue(false);
  await login();
  expect((await screen.findByText("Check your email")).textContent).toContain("Check your email");
  expect(screen.queryByText("Contribution form")).toBeNull();
});

it("preserves the intended destination after a verified login", async () => {
  (signIn as jest.Mock).mockResolvedValue(true);
  await login();
  expect(await screen.findByText("Contribution form")).toBeTruthy();
});
