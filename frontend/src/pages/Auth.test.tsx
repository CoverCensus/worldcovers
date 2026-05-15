import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import * as auth from "@/lib/auth";
import * as api from "@/lib/api";
import Auth from "./Auth";

const mockNavigate = jest.fn();
const mockToast = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getStoredUser: jest.fn(() => null),
    setStoredUser: jest.fn(),
  };
});

describe("Auth (login page)", () => {
  const renderPage = () =>
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

  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    jest.mocked(auth.getStoredUser).mockReturnValue(null);
    jest.mocked(auth.setStoredUser).mockClear();

    jest.spyOn(api, "ensureCsrfToken").mockResolvedValue(null);
    jest.spyOn(api.default, "post").mockReset().mockRejectedValue(new Error("Invalid credentials"));
  });

  it("renders sign-in card", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /worldcovers account/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in to access the catalog/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    const signIn = screen.getByRole("button", { name: /^sign in$/i });
    expect(signIn).toHaveAttribute("type", "submit");
    await waitFor(() => {
      expect(signIn).toBeDisabled();
    });
  });

  it("shows email validation after blur with invalid value", async () => {
    const user = userEvent.setup();
    renderPage();
    const email = screen.getByLabelText(/^email$/i);
    await user.click(email);
    await user.keyboard("not-an-email");
    await user.tab();
    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
  });

  it("shows password required when empty and field touched", async () => {
    const user = userEvent.setup();
    renderPage();
    const password = screen.getByLabelText(/^password$/i);
    await user.click(password);
    await user.tab();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderPage();
    const password = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(password.type).toBe("password");
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password.type).toBe("text");
    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password.type).toBe("password");
  });

  it("posts to /login/ via apiClient and shows toast on failure", async () => {
    const postSpy = jest.mocked(api.default.post);

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^email$/i), "reader@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/login/", {
        email: "reader@example.com",
        password: "wrong",
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sign in failed",
          variant: "destructive",
        })
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("stores user and navigates home on successful login", async () => {
    jest.mocked(api.default.post).mockResolvedValueOnce({
      data: {
        user: {
          id: 42,
          username: "reader",
          email: "reader@example.com",
          is_staff: false,
        },
      },
      status: 200,
    } as never);

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^email$/i), "reader@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(auth.setStoredUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 42,
          email: "reader@example.com",
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Welcome back!",
        })
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("handles network error on submit", async () => {
    jest.mocked(api.default.post).mockRejectedValueOnce(new Error("Network down"));

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^email$/i), "reader@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sign in failed",
          description: "Network down",
          variant: "destructive",
        })
      );
    });
  });
});
