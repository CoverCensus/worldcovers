import apiClient from "@/lib/api";
import { setStoredUser, syncCurrentUser, fetchCurrentUser } from "@/lib/auth";
import { accountPost, signIn } from "./account";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  __esModule: true, default: { post: jest.fn(), get: jest.fn() },
  ensureCsrfToken: jest.fn().mockResolvedValue("csrf"),
}));
jest.mock("@/lib/auth", () => ({
  setStoredUser: jest.fn(), syncCurrentUser: jest.fn().mockResolvedValue(undefined),
  fetchCurrentUser: jest.fn(), beginAuthChange: jest.fn(() => 1), isCurrentAuthChange: jest.fn(() => true),
}));

beforeEach(() => jest.clearAllMocks());

it("keeps an email-shaped username on the username-first login path", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 200, data: { meta: { is_authenticated: true } } });
  const user = { id: 1, username: "old@example.com", email: "new@example.com", is_staff: false };
  (fetchCurrentUser as jest.Mock).mockResolvedValue(user);
  (fetchCurrentUser as jest.Mock).mockResolvedValue(user);
  await signIn(user.username, "StrongPass1!");
  expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { username: user.username, password: "StrongPass1!" }, expect.any(Object));
});

it("recovers a lost login response from the server session without posting twice", async () => {
  (apiClient.post as jest.Mock).mockRejectedValue(new Error("Network response lost"));
  const user = { id: 1, username: "member", email: "member@example.com", is_staff: false };
  (fetchCurrentUser as jest.Mock).mockResolvedValue(user);
  await expect(signIn("member", "StrongPass1!")).resolves.toBe(true);
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(setStoredUser).toHaveBeenCalledWith(user);
});

it("does not report a different account as the requested login", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 409, data: { status: 409 } });
  (fetchCurrentUser as jest.Mock).mockRejectedValue(Object.assign(new Error("You are signed in with another account."), { status: 409 }));
  await expect(signIn("member", "StrongPass1!")).rejects.toThrow("another account");
  expect(apiClient.post).toHaveBeenCalledTimes(1);
});

it("explains signup rejected by an existing authenticated session", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 409, data: { status: 409 } });
  await expect(accountPost("signup", {})).rejects.toThrow("You are already signed in");
  expect(syncCurrentUser).toHaveBeenCalledTimes(1);
});

it("identifies a forbidden response even when Django returns HTML", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 403, data: "<!doctype html><title>Forbidden</title>" });
  await expect(accountPost("signup", {})).rejects.toThrow("HTTP 403");
});

it("keeps the server's validation explanation", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 400, data: {
    errors: [{ message: "Password must include a number." }],
  } });
  await expect(accountPost("signup", {})).rejects.toThrow("Password must include a number.");
});

it("includes the status for unexpected empty error responses", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 404, data: null });
  await expect(accountPost("signup", {})).rejects.toThrow("HTTP 404");
});

it("does not store an identity for a pending verification response", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 401, data: {
    status: 401, data: { flows: [{ id: "verify_email", is_pending: true }] },
  } });
  expect(await signIn("new@example.com", "StrongPass1!")).toBe(false);
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(setStoredUser).not.toHaveBeenCalled();
});

it("loads the existing role payload only after authentication", async () => {
  const user = { id: 1, username: "editor", email: "editor@example.com", role: "editor", assigned_collections: [{ id: 2 }] };
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 200, data: { meta: { is_authenticated: true } } });
  (fetchCurrentUser as jest.Mock).mockResolvedValue(user);
  expect(await signIn("editor", "StrongPass1!")).toBe(true);
  expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { username: "editor", password: "StrongPass1!" }, expect.any(Object));
  expect(fetchCurrentUser).toHaveBeenCalledWith(true, "editor");
  expect(setStoredUser).toHaveBeenCalledWith(user);
});

it("recovers after a successful login whose first profile response fails", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 200, data: { meta: { is_authenticated: true } } });
  const user = { id: 1, username: "member", email: "member@example.com", is_staff: false };
  (fetchCurrentUser as jest.Mock).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(user);
  await expect(signIn("member", "StrongPass1!")).resolves.toBe(true);
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(setStoredUser).toHaveBeenCalledWith(user);
});

it("adds a server request ID to a useful account error", async () => {
  const requestId = "a".repeat(32);
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 403, data: "<html>Forbidden</html>", headers: { "x-request-id": requestId } });
  await expect(accountPost("login", {})).rejects.toThrow(`Reference: ${requestId}`);
});

it("rechecks after a lost password-change response without repeating the write", async () => {
  const { passwordPost } = await import("./account");
  (apiClient.post as jest.Mock).mockRejectedValue(new Error("Response lost"));
  await expect(passwordPost("change-password", { current_password: "old", new_password: "new" })).rejects.toThrow("may have changed");
  expect(syncCurrentUser).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledTimes(1);
});
