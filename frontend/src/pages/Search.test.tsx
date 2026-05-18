import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarkingRecord } from "@/services/markings";
import { getMarkingsPage } from "@/services/markings";
import Search from "./Search";

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

jest.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(v: T) => v,
}));

jest.mock("@/hooks/useMarkingYearRange", () => ({
  useMarkingYearRange: () => ({ earliestYear: 1734, latestYear: 1869 }),
}));

jest.mock("@/hooks/useFilterOptions", () => ({
  useFilterOptions: () => ({
    colorOptions: [{ value: "black", label: "BLACK" }],
    shapeOptions: [{ value: "7", label: "C - Circle" }],
    stateOptions: [{ value: "VA", label: "Virginia" }],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/services/markings", () => {
  const actual = jest.requireActual<typeof import("@/services/markings")>("@/services/markings");
  return {
    ...actual,
    getMarkingsPage: jest.fn(),
  };
});

const mockGetMarkingsPage = jest.mocked(getMarkingsPage);

function makeMarking(overrides: Partial<MarkingRecord> = {}): MarkingRecord {
  return {
    id: 101,
    code: "T-101",
    type: "TOWNMARK",
    catalogTxt: "ABINGDON/*VA.*",
    inscriptionTxt: "",
    desc: "",
    isManuscript: false,
    isIrreg: null,
    width: null,
    height: null,
    sizeDisplay: null,
    dateFmt: "",
    impression: "",
    rateVal: null,
    postOfficeId: 1,
    shapeId: 7,
    letteringId: null,
    colorId: null,
    state: "Virginia",
    stateAbbrev: "VA",
    town: "Abingdon",
    shapeName: "C - Circle",
    letteringName: "-",
    colorName: "BLACK",
    postOfficeName: "Abingdon",
    regionName: "Virginia",
    earliestSeen: "1813-01-01",
    latestSeen: "1813-01-01",
    mainImage: null,
    secondImage: null,
    images: [],
    ...overrides,
  };
}

function renderSearch() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/search"]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/search" element={<Search />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

function lastMarkingsCall(): Parameters<typeof getMarkingsPage> {
  const calls = mockGetMarkingsPage.mock.calls;
  return calls[calls.length - 1] as Parameters<typeof getMarkingsPage>;
}

async function waitForFiltersInteractive() {
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/enter town name/i)).not.toBeDisabled();
  });
}

describe("Catalog Search page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockGetMarkingsPage.mockReset();
    mockGetMarkingsPage.mockResolvedValue({
      results: [makeMarking()],
      count: 2890,
      next: null,
      previous: null,
      count_capped: false,
    });
  });

  it("loads markings and shows summary and card title", async () => {
    renderSearch();

    expect(screen.getByRole("heading", { name: /catalog search/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetMarkingsPage).toHaveBeenCalled();
    });

    expect(mockGetMarkingsPage).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({
        type: "all",
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/showing/i)).toHaveTextContent(/2,?890/);
    });

    expect(screen.getByRole("heading", { name: /abingdon,\s*va/i })).toBeInTheDocument();
  });

  it("passes keyword search to getMarkingsPage", async () => {
    const user = userEvent.setup();
    renderSearch();

    await waitForFiltersInteractive();

    const searchInput = screen.getByRole("searchbox", {
      name: /search records by code, catalog text, town, state, shape, lettering, or color/i,
    });
    await user.type(searchInput, "needle");

    await waitFor(() => {
      expect(mockGetMarkingsPage.mock.calls.some((c) => c[2]?.search === "needle")).toBe(true);
    });
  });

  it("passes town filter to getMarkingsPage", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    await user.type(screen.getByPlaceholderText(/enter town name/i), "Richmond");

    await waitFor(() => {
      expect(mockGetMarkingsPage.mock.calls.some((c) => c[2]?.town === "Richmond")).toBe(true);
    });
  });

  it("passes catalog sort as ordering to getMarkingsPage", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    const sortTrigger = document.getElementById("catalog-order");
    expect(sortTrigger).toBeTruthy();
    await user.click(sortTrigger!);

    await user.click(screen.getByRole("option", { name: /state \(a/i }));

    await waitFor(() => {
      const [, , opts] = lastMarkingsCall();
      expect(opts?.ordering).toBe("post_office__region__name,post_office__name,id");
    });
  });

  it("passes type filter Townmark as TOWNMARK", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    const typeTrigger = document.getElementById("mark-type");
    expect(typeTrigger).toBeTruthy();
    await user.click(typeTrigger!);

    await user.click(screen.getByRole("option", { name: /^townmark$/i }));

    await waitFor(() => {
      const [, , opts] = lastMarkingsCall();
      expect(opts).toMatchObject({ type: "TOWNMARK" });
    });
  });

  it("passes Images Only as hasImages to getMarkingsPage", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    await user.click(screen.getByRole("checkbox", { name: /images only/i }));

    await waitFor(() => {
      const [, , opts] = lastMarkingsCall();
      expect(opts).toMatchObject({ hasImages: true });
    });
  });

  it("passes valid year range to getMarkingsPage", async () => {
    renderSearch();
    await waitForFiltersInteractive();

    fireEvent.change(screen.getByLabelText(/^begin year$/i), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText(/^end year$/i), { target: { value: "1810" } });

    await waitFor(() => {
      const [, , opts] = lastMarkingsCall();
      expect(opts).toMatchObject({ beginYear: "1800", endYear: "1810" });
    });
  });

  it("shows year validation when year is out of range", async () => {
    renderSearch();
    await waitForFiltersInteractive();

    fireEvent.change(screen.getByLabelText(/^begin year$/i), { target: { value: "1700" } });

    expect(
      await screen.findByText(/year must be between 1734 and 1869/i)
    ).toBeInTheDocument();
  });

  it("clears filters and refetches with defaults", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    const searchInput = screen.getByRole("searchbox", {
      name: /search records by code, catalog text, town, state, shape, lettering, or color/i,
    });
    await user.type(searchInput, "temp");
    await waitFor(() => {
      expect(mockGetMarkingsPage.mock.calls.some((c) => c[2]?.search === "temp")).toBe(true);
    });

    mockGetMarkingsPage.mockClear();
    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => {
      expect(mockGetMarkingsPage).toHaveBeenCalled();
      const [, , opts] = lastMarkingsCall();
      expect(opts?.search).toBeUndefined();
    });
  });

  it("passes state filter when a state is chosen", async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFiltersInteractive();

    await user.click(screen.getByRole("combobox", { name: /filter by state/i }));
    await user.click(screen.getByRole("option", { name: /^virginia$/i }));

    await waitFor(() => {
      expect(mockGetMarkingsPage.mock.calls.some((c) => c[2]?.state === "VA")).toBe(true);
    });
  });

  it("shows empty state when API returns no rows", async () => {
    mockGetMarkingsPage.mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
      count_capped: false,
    });

    renderSearch();

    await waitFor(() => {
      expect(screen.getByText(/no catalog records found/i)).toBeInTheDocument();
    });
  });

  it("shows toast when getMarkingsPage fails", async () => {
    mockGetMarkingsPage.mockRejectedValueOnce(new Error("Catalog API unavailable"));
    renderSearch();
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error loading catalog",
          description: "Catalog API unavailable",
          variant: "destructive",
        }),
      );
    });
  });
});
