/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { decideContribution, getContribution, mapApiItemToContribution } from "@/services/contributions";
import ContributionDetail from "./ContributionDetail";

jest.mock("@/hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("embla-carousel-react", () => ({ __esModule: true, default: () => [jest.fn(), undefined] }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/referenceWorks", () => ({ getReferenceWorks: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  ...jest.requireActual("@/services/contributions"),
  getContribution: jest.fn(),
  decideContribution: jest.fn(),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "APMC-VT-M0001" }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    id: 48,
    username: "test-editor",
    role: "editor",
    assigned_collections: [{ id: 100, name: "Vermont", region: { id: 200, name: "Vermont", abbrev: "VT" } }],
  });
});

it("shows known fields but prevents approval when the API sends an unrecognized change", async () => {
  (getContribution as jest.Mock).mockResolvedValue(mapApiItemToContribution({
    id: 4339, collection: 100, contributor: 48, status: "pending",
    submitted_data: {
      submission_kind: "marking", type: "TOWNMARK", state: "VT", town: "Burlington",
      desc: "Known Marking description", new_catalog_field: "An unseen proposed change",
    },
  }));
  render(<TooltipProvider><MemoryRouter initialEntries={["/contribution/4339"]}>
    <Routes><Route path="/contribution/:id" element={<ContributionDetail />} /></Routes>
  </MemoryRouter></TooltipProvider>);
  await screen.findByText("Known Marking description");
  expect(screen.getByRole("alert").textContent).toContain("Approval is unavailable");
  const approve = screen.getByRole("button", { name: "Approve" });
  expect(approve.hasAttribute("disabled")).toBe(true);
  fireEvent.click(approve);
  expect(decideContribution).not.toHaveBeenCalled();
  expect(screen.queryByText(/Failed to render submitted data/)).toBeNull();
});

it.each(["pending", "approved"])("renders the %s Marking Submission with its Cover", async (status) => {
  (getContribution as jest.Mock).mockResolvedValue(mapApiItemToContribution({
    id: 4339,
    collection: 100,
    contributor: 48,
    status,
    submitted_data: {
      submission_kind: "marking",
      type: "TOWNMARK",
      state: "VT",
      town: "Burlington",
      inscription_txt: "BURLINGTON VT.",
      description: "Circular town marking in blue ink",
      pending_cover: {
        type: "ENV",
        cover_date_year: "1851",
        description: "Cover addressed to Boston",
        image_metas: [{ storage_filename: "vt/whole-cover.png" }],
      },
      ...(status === "approved" ? { pending_cover_contribution_id: 4340 } : {}),
    },
  }));

  render(<TooltipProvider><MemoryRouter initialEntries={["/contribution/4339"]}>
    <Routes><Route path="/contribution/:id" element={<ContributionDetail />} /></Routes>
  </MemoryRouter></TooltipProvider>);

  await screen.findByRole("heading", { name: /Contribution details/i });
  expect(screen.queryByText(/Failed to render submitted data/)).toBeNull();
  expect(screen.getByText("Circular town marking in blue ink")).toBeTruthy();
  expect(screen.getByText("Dimensions:")).toBeTruthy();

  const cover = within(screen.getByTestId("pending-cover-card"));
  expect(cover.getByText("Cover submitted with this marking")).toBeTruthy();
  expect(cover.getByText("Cover addressed to Boston")).toBeTruthy();
  expect(cover.getByText("1851")).toBeTruthy();
  expect(cover.getByAltText("Cover image submitted with the marking").getAttribute("src"))
    .toContain("vt/whole-cover.png");
  if (status === "approved") {
    expect(cover.getByRole("link", { name: "Cover submission #4340" }).getAttribute("href"))
      .toBe("/contribution/4340");
  } else {
    expect(cover.getByText(/When this marking is approved/)).toBeTruthy();
    expect(cover.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  }
});
