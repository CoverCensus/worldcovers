/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import apiClient from "@/lib/api";
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
import Auth from "./Auth";
import { clearStoredUser } from "@/lib/auth";

jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useSiteInfo", () => ({ useSiteInfo: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

it("leaves the signup page when Django finds an existing session without local storage", async () => {
  clearStoredUser();
  apiClient.get = jest.fn().mockResolvedValue({ status: 200, data: { user: {
    id: 1, username: "member", email: "member@example.com", is_staff: false,
  } } });
  render(<MemoryRouter initialEntries={[{ pathname: "/auth", state: { from: "/contribute" } }]}>
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/contribute" element={<p>Contribution form</p>} />
    </Routes>
  </MemoryRouter>);
  expect(await screen.findByText("Contribution form")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
});
