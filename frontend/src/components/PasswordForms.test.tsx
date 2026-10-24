/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import ResetPassword from "@/pages/ResetPassword";
import { passwordPost } from "@/services/account";
import { clearStoredUser, syncCurrentUser } from "@/lib/auth";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/services/account", () => ({ passwordPost: jest.fn() }));
jest.mock("@/lib/auth", () => ({ clearStoredUser: jest.fn(), syncCurrentUser: jest.fn().mockResolvedValue(undefined) }));

beforeEach(() => jest.clearAllMocks());
const password = " NewPass1! ";

it("clears the account and returns to sign in after a password change", async () => {
  (passwordPost as jest.Mock).mockResolvedValue({ detail: "Password changed. Please sign in again." });
  render(<MemoryRouter><Routes>
    <Route path="/" element={<ChangePasswordForm open onOpenChange={jest.fn()} />} />
    <Route path="/auth" element={<p>Sign in again</p>} />
  </Routes></MemoryRouter>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), " OldPass1! ");
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), password);
  await user.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByText("Sign in again")).toBeTruthy();
  expect(clearStoredUser).toHaveBeenCalledTimes(1);
  expect(passwordPost).toHaveBeenCalledWith("change-password", { current_password: " OldPass1! ", new_password: password });
});

it("uses shared recovery handling and keeps failures visible without claiming mail was sent", async () => {
  (passwordPost as jest.Mock).mockRejectedValue(new Error("Mail unavailable. Reference: 1234."));
  const close = jest.fn();
  render(<ForgotPasswordForm open onOpenChange={close} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "member@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "Mail unavailable. Reference: 1234.", variant: "destructive" })));
  expect(passwordPost).toHaveBeenCalledWith("forgot-password", { email: "member@example.com" });
  expect(close).not.toHaveBeenCalled();
});

it("sends an exact reset password through the shared client and checks the session", async () => {
  (passwordPost as jest.Mock).mockResolvedValue({ detail: "Password reset." });
  render(<MemoryRouter initialEntries={["/reset-password?uid=MQ&token=reset-key"]}><Routes>
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/auth" element={<p>Sign in again</p>} />
  </Routes></MemoryRouter>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm password"), password);
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  expect(await screen.findByText("Sign in again")).toBeTruthy();
  expect(passwordPost).toHaveBeenCalledWith("reset-password", { uid: "MQ", token: "reset-key", password });
  expect(syncCurrentUser).toHaveBeenCalledTimes(1);
});
