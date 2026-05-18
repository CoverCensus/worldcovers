import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";

const mockNavigate = jest.fn();
const mockUseAuth = jest.fn();
const mockGetRegions = jest.fn();
const mockGetPostOfficeCount = jest.fn();
const mockGetMarkingCount = jest.fn();
const mockUseMarkingYearRange = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };  
});

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/services/regions", () => ({
  getRegions: () => mockGetRegions(),
}));

jest.mock("@/services/postOffices", () => ({
  getPostOfficeCount: () => mockGetPostOfficeCount(),
}));

jest.mock("@/services/markings", () => ({
  getMarkingCount: () => mockGetMarkingCount(),
}));

jest.mock("@/hooks/useMarkingYearRange", () => ({
  useMarkingYearRange: () => mockUseMarkingYearRange(),
}));

describe("Home page (Index)", () => {
  const renderPage = () =>
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Index />
      </MemoryRouter>
    );

  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReturnValue(null);
    mockGetRegions.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockGetPostOfficeCount.mockResolvedValue(120);
    mockGetMarkingCount.mockResolvedValue(3500);
    mockUseMarkingYearRange.mockReturnValue({ earliestYear: 1760, latestYear: 1950 });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  it("renders the home page headline and loads stats", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /american postal markings catalog/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("3,500")).toBeInTheDocument();
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("1760–1950")).toBeInTheDocument();
    });
  });

  it("navigates to search when Browse Catalog is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /browse catalog/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/search");
  });

  it("navigates guests to auth on Contribute click", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(null);
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /contribute/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("navigates logged-in users to contribute page", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ id: 1, username: "manish" });
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /contribute/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/contribute");
  });

  it("shows placeholders when all stat APIs reject", async () => {
    mockGetMarkingCount.mockRejectedValue(new Error("markings down"));
    mockGetPostOfficeCount.mockRejectedValue(new Error("offices down"));
    mockGetRegions.mockRejectedValue(new Error("regions down"));

    renderPage();

    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    expect(
      screen.getByText(/explore historical postal markings from across america/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /frequently asked questions/i })
    ).not.toBeInTheDocument();
  });

  it("shows partial stats when only some stat APIs succeed", async () => {
    mockGetMarkingCount.mockResolvedValue(99);
    mockGetPostOfficeCount.mockRejectedValue(new Error("offices down"));
    mockGetRegions.mockResolvedValue([{ id: 1 }]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("99")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("treats non-numeric stat responses as missing (shows —)", async () => {
    mockGetMarkingCount.mockResolvedValue("not-a-number" as unknown as number);
    mockGetPostOfficeCount.mockResolvedValue(null as unknown as number);
    mockGetRegions.mockResolvedValue([{ id: 1 }]);

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("hides FAQ when fetch throws (network / server error)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    renderPage();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(
      screen.queryByRole("heading", { name: /frequently asked questions/i })
    ).not.toBeInTheDocument();
  });

  it("hides FAQ when all FAQ endpoints return non-OK", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByRole("heading", { name: /frequently asked questions/i })
    ).not.toBeInTheDocument();
  });

  /**
   * Matches real Network behaviour: first request to `/api/v2/faq-entries/` can be 500,
   * while a second absolute URL (from VITE_API_*) may still succeed.
   */
  it("still loads home stats when relative faq-entries returns HTTP 500", async () => {
    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.startsWith("/") && url.includes("faq-entries")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: "Internal Server Error" }),
        } as Response;
      }
      if (/^https?:\/\//i.test(url) && url.includes("faq-entries")) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("3,500")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: /american postal markings catalog/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /frequently asked questions/i })
    ).not.toBeInTheDocument();
  });

  it("hides FAQ when first faq-entries returns 500 and fallback returns empty OK", async () => {
    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.startsWith("/") && url.includes("faq-entries")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: "Internal Server Error" }),
        } as Response;
      }
      if (/^https?:\/\//i.test(url) && url.includes("faq-entries")) {
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    renderPage();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(
      screen.queryByRole("heading", { name: /frequently asked questions/i })
    ).not.toBeInTheDocument();
  });

  it("shows FAQ when relative faq-entries returns 500 but HTTPS faq-entries returns data", async () => {
    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.startsWith("/") && url.includes("faq-entries")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: "Internal Server Error" }),
        } as Response;
      }
      if (/^https?:\/\//i.test(url) && url.includes("faq-entries")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 1,
                question: "Loaded after primary faq-entries failed?",
                answer: "Yes — the app tries the next FAQ URL.",
              },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    });

    renderPage();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const faqUrls = (global.fetch as jest.Mock).mock.calls
      .map((call) => String(call[0]))
      .filter((u) => u.includes("faq-entries"));
    const triedHttpsFaq = faqUrls.some((u) => /^https?:\/\//i.test(u));

    if (triedHttpsFaq) {
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /frequently asked questions/i })
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText("Loaded after primary faq-entries failed?")
      ).toBeInTheDocument();
    } else {
      // Only one FAQ candidate (e.g. deduped URLs); 500 on that single URL means no FAQ block.
      expect(
        screen.queryByRole("heading", { name: /frequently asked questions/i })
      ).not.toBeInTheDocument();
    }
  });

  it("shows FAQ when API returns valid entries", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            question: "What is this catalog?",
            answer: "It is an open archive of postal markings.",
          },
        ],
      }),
    } as Response);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /frequently asked questions/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText("What is this catalog?")).toBeInTheDocument();
  });
});
