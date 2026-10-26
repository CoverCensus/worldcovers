/**
 * @jest-environment jsdom
 */
jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
  ensureCsrfToken: jest.fn().mockResolvedValue("csrf-token"),
}));

describe("auth storage cache", () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("keeps a usable in-memory identity when browser storage is denied", async () => {
    const auth = await import("./auth");
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const user = { id: 1, username: "member", email: "member@example.com", is_staff: false };
    expect(() => auth.setStoredUser(user)).not.toThrow();
    expect(auth.getStoredUser()).toEqual(user);
    expect(() => auth.clearStoredUser()).not.toThrow();
    expect(auth.getStoredUser()).toBeNull();
  });

  it("does not treat a forbidden session check as proof of logout", async () => {
    const auth = await import("./auth");
    const user = { id: 1, username: "member", email: "member@example.com", is_staff: false };
    auth.setStoredUser(user);
    (await import("./api")).default.get = jest.fn().mockResolvedValue({ status: 403 });
    await expect(auth.syncCurrentUser()).rejects.toThrow();
    expect(auth.getStoredUser()).toEqual(user);
  });

  it("does not restore a session when a check started before logout", async () => {
    const auth = await import("./auth");
    let resolveFetch: (value: unknown) => void = () => {};
    (await import("./api")).default.get = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; })) as jest.Mock;
    const request = auth.syncCurrentUser();
    auth.clearStoredUser();
    resolveFetch({ status: 200, data: { user: {
      id: 1, username: "old", email: "old@example.com", is_staff: false,
    } } });
    await request;
    expect(auth.getStoredUser()).toBeNull();
  });

  it("keeps the displayed user when logout fails, then clears it on success", async () => {
    const auth = await import("./auth");
    const user = { id: 1, username: "member", email: "member@example.com", is_staff: false };
    auth.setStoredUser(user);
    const { default: apiClient, ensureCsrfToken } = await import("./api");
    (apiClient.get as jest.Mock).mockResolvedValue({ status: 200, data: { user } });
    (apiClient.post as jest.Mock).mockRejectedValue(new Error("Sign out failed"));
    await expect(auth.signOut()).rejects.toThrow("Sign out failed");
    expect(auth.getStoredUser()).toEqual(user);
    (apiClient.post as jest.Mock).mockResolvedValue({ status: 200 });
    await auth.signOut();
    expect(auth.getStoredUser()).toBeNull();
    expect(ensureCsrfToken).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenLastCalledWith("/logout/");
  });

  it("does not let an older current-user request replace a newer login cache", async () => {
    const oldUser = {
      id: 1,
      username: "olduser",
      email: "old@example.com",
      is_staff: false,
    };
    const newUser = {
      id: 2,
      username: "newuser",
      email: "new@example.com",
      is_staff: false,
    };

    let resolveFetch: (value: unknown) => void = () => {};
    const fetchMock = jest.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    (await import("./api")).default.get = fetchMock as jest.Mock;

    const auth = await import("./auth");
    const staleRequest = auth.fetchCurrentUser();

    auth.setStoredUser(newUser);
    resolveFetch({
      status: 200,
      data: { user: oldUser },
    });

    await expect(staleRequest).resolves.toEqual(oldUser);
    await expect(auth.fetchCurrentUser()).resolves.toEqual(newUser);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("logout response recovery", () => {
  beforeEach(() => { jest.resetModules(); localStorage.clear(); });

  it("accepts a lost logout response only when the server confirms Guest", async () => {
    const auth = await import("./auth");
    const { default: api } = await import("./api");
    auth.setStoredUser({ id: 1, username: "member", email: "member@example.com", is_staff: false });
    (api.post as jest.Mock).mockRejectedValue(new Error("Response lost"));
    (api.get as jest.Mock).mockResolvedValue({ status: 401 });
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.getAuthState().status).toBe("guest");
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});


describe("login session identity", () => {
  beforeEach(() => { jest.resetModules(); localStorage.clear(); });
  it("requires the server to resolve an email and username collision", async () => {
    const auth = await import("./auth");
    const { default: api } = await import("./api");
    (api.get as jest.Mock).mockResolvedValue({ status: 200, data: {
      user: { id: 2, username: "other", email: "member", is_staff: false },
      matches_login_identifier: false,
    } });
    await expect(auth.fetchCurrentUser(true, "member")).rejects.toThrow("another account");
  });
});
