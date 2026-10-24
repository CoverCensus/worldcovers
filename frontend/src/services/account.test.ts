import apiClient from "@/lib/api";
import { setStoredUser } from "@/lib/auth";
import { signIn } from "./account";

jest.mock("@/lib/api", () => ({
  __esModule: true, default: { post: jest.fn(), get: jest.fn() },
  ensureCsrfToken: jest.fn().mockResolvedValue("csrf"),
}));
jest.mock("@/lib/auth", () => ({ setStoredUser: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it("does not store an identity for a pending verification response", async () => {
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 401, data: {
    status: 401, data: { flows: [{ id: "verify_email", is_pending: true }] },
  } });
  expect(await signIn("new@example.com", "StrongPass1!")).toBe(false);
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(setStoredUser).not.toHaveBeenCalled();
});

it("loads the existing role payload only after authentication", async () => {
  const user = { id: 1, username: "editor", role: "editor", assigned_collections: [{ id: 2 }] };
  (apiClient.post as jest.Mock).mockResolvedValue({ status: 200, data: { meta: { is_authenticated: true } } });
  (apiClient.get as jest.Mock).mockResolvedValue({ data: { user } });
  expect(await signIn("editor", "StrongPass1!")).toBe(true);
  expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { username: "editor", password: "StrongPass1!" }, expect.any(Object));
  expect(apiClient.get).toHaveBeenCalledWith("/me/");
  expect(setStoredUser).toHaveBeenCalledWith(user);
});
