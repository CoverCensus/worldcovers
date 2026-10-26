/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import VerifyEmail from "./VerifyEmail";
import { accountPost } from "@/services/account";

jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/services/account", () => ({ accountPost: jest.fn() }));
const mockPost = accountPost as jest.Mock;

beforeEach(() => mockPost.mockReset());

it("requires explicit confirmation and then offers sign in", async () => {
  mockPost.mockResolvedValue({ status: 401 });
  render(<MemoryRouter initialEntries={["/verify-email?key=signed%3Akey"]}><VerifyEmail /></MemoryRouter>);
  expect(mockPost).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Confirm email" }));
  expect(mockPost).toHaveBeenCalledWith("email/verify", { key: "signed:key" });
  expect((await screen.findByRole("status")).textContent).toContain("Your email is verified");
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth");
});

it("shows invalid-link errors without claiming verification", async () => {
  mockPost.mockRejectedValue(new Error("Invalid or expired key."));
  render(<MemoryRouter initialEntries={["/verify-email?key=bad"]}><VerifyEmail /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Confirm email" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Invalid or expired key."));
  expect(screen.queryByRole("status")).toBeNull();
});

it("does not send a request for a missing key", () => {
  render(<MemoryRouter><VerifyEmail /></MemoryRouter>);
  expect(screen.queryByRole("button")).toBeNull();
  expect(mockPost).not.toHaveBeenCalled();
});
