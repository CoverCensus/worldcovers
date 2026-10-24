/** @jest-environment jsdom */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestLoginForm } from "./RequestLoginForm";
import { accountPost } from "@/services/account";

jest.mock("@/services/account", () => ({
  ...jest.requireActual("@/services/account"), accountPost: jest.fn(),
}));
const mockPost = accountPost as jest.Mock;

beforeEach(() => mockPost.mockReset());

async function fill(confirmation = "StrongPass1!") {
  render(<RequestLoginForm open onOpenChange={jest.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("First name"), "New");
  await user.type(screen.getByLabelText("Last name"), "Collector");
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Password"), "StrongPass1!");
  await user.type(screen.getByLabelText("Confirm password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

it("keeps pending verification visible and clears the password form", async () => {
  mockPost.mockResolvedValue({ status: 401, data: { flows: [{ id: "verify_email", is_pending: true }] } });
  await fill();
  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(mockPost).toHaveBeenCalledWith("signup", {
    first_name: "New", last_name: "Collector", email: "new@example.com", password: "StrongPass1!",
  });
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(window.localStorage.getItem("password")).toBeNull();
});

it("refuses mismatched passwords before signup", async () => {
  await fill("DifferentPass1!");
  expect((await screen.findByRole("alert")).textContent).toContain("Passwords do not match");
  expect(mockPost).not.toHaveBeenCalled();
});

it("shows delivery failure without claiming an email was sent", async () => {
  mockPost.mockRejectedValue(new Error("We could not send the email."));
  await fill();
  expect((await screen.findByRole("alert")).textContent).toContain("could not send");
  expect(screen.queryByText("Check your email")).toBeNull();
});


it("starts with a fresh form when signup is reopened", async () => {
  mockPost.mockResolvedValue({ status: 401, data: { flows: [{ id: "verify_email", is_pending: true }] } });
  function Parent() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open signup</button><RequestLoginForm open={open} onOpenChange={setOpen} /></>;
  }
  render(<Parent />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Open signup"));
  await user.type(screen.getByLabelText("First name"), "New");
  await user.type(screen.getByLabelText("Last name"), "Collector");
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Password"), "StrongPass1!");
  await user.type(screen.getByLabelText("Confirm password"), "StrongPass1!");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText("Check your email");
  await user.click(screen.getByText("Back to sign in"));
  await user.click(screen.getByText("Open signup"));
  expect(screen.queryByText("Check your email")).toBeNull();
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
});
