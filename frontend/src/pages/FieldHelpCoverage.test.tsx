/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Contribute from "./Contribute";
import CoverEdit from "./CoverEdit";
import { createContribution } from "@/services/contributions";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ id: 1, role: "contributor" }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/services/colors", () => ({ getColors: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/similarEntries", () => ({ getSimilarMarkings: jest.fn().mockResolvedValue({ rows: [], matchCount: 0, relatedCount: 0 }) }));
jest.mock("@/services/shapes", () => ({ getShapes: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/postOffices", () => ({ getPostOffices: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/regions", () => ({ getRegions: jest.fn().mockResolvedValue([{ value: "VA", label: "Virginia" }]) }));
jest.mock("@/services/letterings", () => ({ getLetterings: jest.fn().mockResolvedValue([]) }));
jest.mock("@/constants/markingEnums", () => ({ getDateFormats: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/contributions", () => ({
  getContribution: jest.fn(), createContribution: jest.fn(),
  listContributions: jest.fn().mockResolvedValue({ rawItems: [] }),
  getDirectCatalogCodeSuggestion: jest.fn().mockResolvedValue({ catalogCode: "VA-NEW" }),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"),
  getReferenceWorks: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/citations", () => ({ listCitationsForSubject: jest.fn().mockResolvedValue([]) }));
jest.mock("@/services/markings", () => ({
  ...jest.requireActual("@/services/markings"),
  getMarkingByIdRaw: jest.fn(),
  routingStateFromMarkingRecord: () => "VA",
  getMarkingById: jest.fn().mockResolvedValue({ id: 7, state: "Virginia", stateAbbrev: "VA" }),
  getMarkingCovers: jest.fn().mockResolvedValue({ covers: [] }),
  getImagesForSubject: jest.fn().mockResolvedValue([]),
  normalizeImageUrl: (value: string) => value,
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => jest.clearAllMocks());

function open(path: string, route: string, page: React.ReactElement) {
  render(<TooltipProvider delayDuration={0}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path={route} element={page} />
  </Routes></MemoryRouter></TooltipProvider>);
}

const help = (label: string) => screen.getByRole("button", { name: `Help for ${label}` });

describe("Marking form field help (S33)", () => {
  it("defines every always-visible field and the handstamp-only ones", async () => {
    open("/contribute", "/contribute", <Contribute />);
    await screen.findByRole("button", { name: /save as draft/i });

    for (const label of ["Marking Type", "Manuscript", "State", "Town/City", "Color", "Description", "Reference Works"]) {
      expect(help(label)).toBeInTheDocument();
    }
    // A new Marking is handstamped until Manuscript is ticked, whatever its
    // type, so Shape and the dimensions (and their help) are visible at once.
    expect(help("Shape")).toBeInTheDocument();
    expect(help("Width")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help for Height" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Help for Catalog Marking code" })).toBeNull();

    fireEvent.click(screen.getByLabelText("Manuscript"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Help for Shape" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Help for Width" })).toBeNull();
  });

  it("never submits the form from a help button", async () => {
    open("/contribute", "/contribute", <Contribute />);
    await screen.findByRole("button", { name: /save as draft/i });
    const button = help("State");
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    expect(createContribution).not.toHaveBeenCalled();
  });
});

describe("Cover form field help (S33)", () => {
  it("defines every field, outside the checkbox labels", async () => {
    open("/record/7/cover/new", "/record/:id/cover/new", <CoverEdit />);
    await screen.findByRole("button", { name: /save as draft/i });

    for (const label of ["Type", "Date", "No image available", "Institutionally Owned", "Backstamp", "Description", "Reference Works"]) {
      expect(help(label)).toBeInTheDocument();
    }
    const backstamp = screen.getByRole("checkbox", { name: "Backstamp" });
    expect(backstamp).not.toBeChecked();
    fireEvent.click(help("Backstamp"));
    expect(backstamp).not.toBeChecked();
  });
});
