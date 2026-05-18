import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RecordDetail from "./RecordDetail";

const mockNavigate = jest.fn();
const mockToast = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => mockUseAuth() }));

const mockGetMarkingById = jest.fn();
const mockGetMarkingCovers = jest.fn();
const mockGetMarkingChangelog = jest.fn();

jest.mock("@/services/markings", () => ({
  getMarkingById: (...args: unknown[]) => mockGetMarkingById(...args),
  getMarkingCovers: (...args: unknown[]) => mockGetMarkingCovers(...args),
  getMarkingChangelog: (...args: unknown[]) => mockGetMarkingChangelog(...args),
  normalizeImageUrl: (u: string | null) => u,
  reorderImages: jest.fn(),
}));

jest.mock("@/services/covers", () => ({ deleteCover: jest.fn() }));

jest.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselNext: () => <button>Next</button>,
  CarouselPrevious: () => <button>Prev</button>,
}));

jest.mock("@/lib/catalogRecordDisplay", () => ({
  formatCatalogDate: (s: string) => s,
  markingTypeLabel: (t: string) => t,
}));

const sampleRecord = {
  id: 42,
  code: "WA-100",
  type: "TOWNMARK" as const,
  catalogTxt: "WA-100",
  inscriptionTxt: "SEATTLE WA",
  desc: "",
  isManuscript: false,
  isIrreg: null,
  width: "30",
  height: "20",
  sizeDisplay: "30x20",
  dateFmt: "",
  impression: "",
  rateVal: null,
  postOfficeId: null,
  shapeId: null,
  letteringId: null,
  colorId: null,
  state: "Washington",
  stateAbbrev: "WA",
  town: "Seattle",
  shapeName: "Oval",
  letteringName: "",
  colorName: "Black",
  postOfficeName: "Seattle PO",
  regionName: "",
  earliestSeen: "1890",
  latestSeen: "1920",
  mainImage: null,
  secondImage: null,
  images: [],
};

const renderDetail = (id = "42") =>
  render(
    <MemoryRouter
      initialEntries={[`/record/${id}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/record/:id" element={<RecordDetail />} />
      </Routes>
    </MemoryRouter>,
  );

describe("RecordDetail page", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockUseAuth.mockReturnValue(null);
    mockGetMarkingById.mockResolvedValue(sampleRecord);
    mockGetMarkingCovers.mockResolvedValue([]);
    mockGetMarkingChangelog.mockResolvedValue(null);
  });

  it("renders marking details after loading", async () => {
    renderDetail();
    expect((await screen.findAllByText(/seattle/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/washington/i).length).toBeGreaterThan(0);
  });

  it("shows catalog page number / code", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByText(/WA-100/).length).toBeGreaterThan(0)
    );
  });

  it("shows inscription / townmark text", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText(/SEATTLE WA/)).toBeInTheDocument()
    );
  });

  it("shows error message in page when getMarkingById fails", async () => {
    mockGetMarkingById.mockRejectedValueOnce(new Error("Not found"));
    renderDetail();
    expect(await screen.findByText(/failed to load record/i)).toBeInTheDocument();
  });

  it("renders without crashing for a staff user", async () => {
    mockUseAuth.mockReturnValue({ id: 1, username: "admin", email: "a@b.com", is_staff: true });
    mockGetMarkingChangelog.mockResolvedValue([]);
    renderDetail();
    expect((await screen.findAllByText(/seattle/i)).length).toBeGreaterThan(0);
  });
});
