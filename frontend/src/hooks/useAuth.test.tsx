/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import apiClient from "@/lib/api";
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
import { useAuth } from "./useAuth";
import { setStoredUser, clearStoredUser, type AuthUser } from "@/lib/auth";

function AuthProbe() {
  const user = useAuth();
  return <div data-testid="user">{user ? user.username : "none"}</div>;
}

describe("useAuth", () => {
  beforeEach(() => {
    clearStoredUser();
    jest.restoreAllMocks();
  });

  it("rechecks the session when a sleeping tab returns", async () => {
    const user = { id: 3, username: "member", email: "member@example.com", is_staff: false };
    apiClient.get = jest.fn().mockResolvedValueOnce({ status: 200, data: { user } })
      .mockResolvedValue({ status: 401 });
    render(<AuthProbe />);
    await act(async () => {});
    expect(screen.getByTestId("user").textContent).toBe("member");
    await act(async () => { window.dispatchEvent(new Event("pageshow")); });
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("ignores a stale response after another tab clears storage", async () => {
    const user = { id: 3, username: "old", email: "member@example.com", is_staff: false };
    setStoredUser(user);
    let finish: (value: unknown) => void = () => {};
    apiClient.get = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ status: 401 });
    render(<AuthProbe />);
    await act(async () => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
      finish({ status: 200, data: { user } });
    });
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("discovers a server session even when the local display says signed out", async () => {
    const user: AuthUser = { id: 3, username: "serveruser", email: "user@example.com", is_staff: false };
    apiClient.get = jest.fn().mockResolvedValue({ status: 200, data: { user } });
    render(<AuthProbe />);
    expect(screen.getByTestId("user").textContent).toBe("none");
    await act(async () => {});
    expect(apiClient.get).toHaveBeenCalledWith("/me/", expect.any(Object));
    expect(screen.getByTestId("user").textContent).toBe("serveruser");
    expect(JSON.parse(localStorage.getItem("worldcovers_user") || "null")).toEqual(user);
  });

  it("does not show a logout when the session check fails", async () => {
    const user: AuthUser = { id: 3, username: "serveruser", email: "user@example.com", is_staff: false };
    setStoredUser(user);
    apiClient.get = jest.fn().mockResolvedValue({ status: 500 });
    render(<AuthProbe />);
    await act(async () => {});
    expect(screen.getByTestId("user").textContent).toBe("serveruser");
  });

  it("clears the displayed user when the server session has expired", async () => {
    setStoredUser({ id: 3, username: "expired", email: "user@example.com", is_staff: false });
    apiClient.get = jest.fn().mockResolvedValue({ status: 401 });
    render(<AuthProbe />);
    await act(async () => {});
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("keeps a new login event when an older server sync resolves later", async () => {
    const oldUser: AuthUser = {
      id: 1,
      username: "olduser",
      email: "old@example.com",
      is_staff: false,
    };
    const newUser: AuthUser = {
      id: 2,
      username: "newuser",
      email: "new@example.com",
      is_staff: false,
    };

    setStoredUser(oldUser);

    let resolveFetch: (value: unknown) => void = () => {};
    apiClient.get = jest.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    })) as jest.Mock;

    render(<AuthProbe />);
    expect(screen.getByTestId("user").textContent).toBe("olduser");

    act(() => {
      setStoredUser(newUser);
    });
    expect(screen.getByTestId("user").textContent).toBe("newuser");

    await act(async () => {
      resolveFetch({
        status: 200,
        data: { user: oldUser },
      });
    });

    expect(screen.getByTestId("user").textContent).toBe("newuser");
  });
});
