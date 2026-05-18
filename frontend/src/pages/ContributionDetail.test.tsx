import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ContributionDetail from "./ContributionDetail";

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

jest.mock("@/services/markings", () => ({
  getMarkingByIdRaw: jest.fn().mockResolvedValue(null),
  normalizeImageUrl: (u: string | null) => u,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/framings", () => ({ getFramings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/postmarkEnums", () => ({ getDateFormats: jest.fn().mockReturnValue([]) }));
jest.mock("@/services/regions", () => ({ getRegions: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));

jest.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselNext: () => <button>Next</button>,
  CarouselPrevious: () => <button>Prev</button>,
}));

const renderPage = (id: string) =>
  render(
    <MemoryRouter
      initialEntries={[`/contribution/${id}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/contribution/:id" element={<ContributionDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe("ContributionDetail page", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(null);
  });

  it("shows invalid contribution message when route id is not numeric", async () => {
    renderPage("abc");
    expect(await screen.findByText(/invalid contribution/i)).toBeInTheDocument();
  });

  it("shows not found message when API returns 404", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    renderPage("42");

    expect(await screen.findByText(/contribution not found/i)).toBeInTheDocument();
  });

  it("renders contribution heading after successful load", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        status: "pending",
        contributor_username: "alice",
        contributor_id: 99,
        review_notes: null,
        created_at: "2025-01-01T00:00:00Z",
        submitted_data: {
          state: "Virginia",
          town: "Richmond",
          shape: "Circle",
          manuscript: "No",
        },
      }),
    } as Response);

    renderPage("42");

    expect(
      await screen.findByRole("heading", { name: /richmond, virginia — circle/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/back to dashboard/i)).toBeInTheDocument();
  });
});
