/**
 * @jest-environment jsdom
 */
// Trello S19 -- the Editors' Reference Works page: list, add, edit, errors.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import ReferenceWorks from "./ReferenceWorks";
import {
  createReferenceWork,
  getReferenceWorks,
  updateReferenceWork,
  type ReferenceWorkRecord,
} from "@/services/referenceWorks";

const mockToast = jest.fn();
jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));
jest.mock("@/services/referenceWorks", () => ({
  ...jest.requireActual("@/services/referenceWorks"),
  getReferenceWorks: jest.fn(),
  createReferenceWork: jest.fn(),
  updateReferenceWork: jest.fn(),
}));

const mockedList = getReferenceWorks as jest.Mock;
const mockedCreate = createReferenceWork as jest.Mock;
const mockedUpdate = updateReferenceWork as jest.Mock;

const ascc: ReferenceWorkRecord = {
  id: 14, code: "ASCC6", title: "American Stampless Cover Catalog",
  authorship: "David G. Phillips", publisher: "Phillips Publishing", publicationYear: 1997,
  edition: "6", volume: "", isbn: "", url: "", createdDate: "", modifiedDate: "",
};
const fphc: ReferenceWorkRecord = {
  id: 17, code: "FPHC2", title: "Florida Postal History 1763-1861",
  authorship: "Deane R. Briggs; Francis Ferguson; Thomas M. Lera", publisher: "FPHS",
  publicationYear: 2021, edition: "2", volume: "", isbn: "", url: "", createdDate: "", modifiedDate: "",
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <ReferenceWorks />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // Radix tooltips need ResizeObserver in jsdom.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  mockedList.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
  mockToast.mockReset();
  mockedList.mockResolvedValue([ascc, fphc]);
});

describe("ReferenceWorks page", () => {
  it("lists every work with the compact author line and no delete control", async () => {
    renderPage();
    expect(await screen.findByText("ASCC6 - American Stampless Cover Catalog (6th Ed.)")).toBeTruthy();
    const navigation = within(screen.getByRole("navigation", { name: "Editor navigation" }));
    expect(navigation.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "My Submissions", "User Submissions", "Editors", "Reference Works",
    ]);
    expect(navigation.getByRole("link", { name: "Reference Works" }).getAttribute("aria-current")).toBe("page");
    expect(navigation.getByRole("link", { name: "Editors" }).getAttribute("href")).toBe("/editors");
    expect(screen.getByText("On submission forms: Deane R. Briggs et al. | 2nd Ed. | 2021")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Edit / }).length).toBe(2);
    expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
  });

  it("adds a work from the form and reports the saved label", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({ ...fphc, id: 21, code: "BPM2", title: "Boston Postal Markings to 1890" });
    renderPage();
    await screen.findByText(/American Stampless/);
    await user.click(screen.getByRole("button", { name: "New Reference Work" }));
    const form = screen.getByRole("form", { name: "New Reference Work" });
    for (const label of ["Title", "Code", "Authorship", "Publisher", "Publication year", "Edition", "Volume", "ISBN", "URL"]) {
      expect(within(form).getByRole("button", { name: `Help for ${label}` })).toBeTruthy();
    }
    await user.type(within(form).getByLabelText(/^Title/), "Boston Postal Markings to 1890");
    await user.type(within(form).getByLabelText(/^Code/), " BPM2 ");
    await user.type(within(form).getByLabelText(/^Authorship/), "Blake, Maurice C. and Davis, Wilbur W.");
    expect(screen.getByTestId("authorship-preview").textContent).toContain("Blake, Maurice C. et al.");
    await user.type(within(form).getByLabelText(/^Publisher/), "Philatelic Foundation");
    await user.type(within(form).getByLabelText(/^Publication year/), "1949");
    await user.type(within(form).getByLabelText(/^Edition/), "2");
    await user.click(within(form).getByRole("button", { name: "Add Reference Work" }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith({
      code: "BPM2",
      title: "Boston Postal Markings to 1890",
      authorship: "Blake, Maurice C. and Davis, Wilbur W.",
      publisher: "Philatelic Foundation",
      publication_year: 1949,
      edition: "2",
      volume: null,
      isbn: null,
      url: null,
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reference Work added." })));
    expect(screen.queryByRole("form", { name: "New Reference Work" })).toBeNull();
  });

  it("edits an existing work with a PATCH and keeps the form open on an API error", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(new Error("This code is cited by existing Entries"));
    mockedUpdate.mockResolvedValueOnce({ ...ascc, title: "American Stampless Cover Catalogue" });
    renderPage();
    await screen.findByText(/American Stampless/);
    await user.click(screen.getByRole("button", { name: "Edit ASCC6 - American Stampless Cover Catalog (6th Ed.)" }));
    const form = screen.getByRole("form", { name: "Edit Reference Work" });
    const title = within(form).getByLabelText(/^Title/) as HTMLInputElement;
    expect(title.value).toBe("American Stampless Cover Catalog");
    await user.clear(title);
    await user.type(title, "American Stampless Cover Catalogue");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect((await within(form).findByRole("alert")).textContent).toContain("This code is cited by existing Entries");
    expect(mockedUpdate).toHaveBeenLastCalledWith(14, expect.objectContaining({
      title: "American Stampless Cover Catalogue",
      code: "ASCC6",
      publication_year: 1997,
    }));

    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reference Work updated." })));
  });

  it("refuses an empty form before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/American Stampless/);
    await user.click(screen.getByRole("button", { name: "New Reference Work" }));
    const form = screen.getByRole("form", { name: "New Reference Work" });
    await user.click(within(form).getByRole("button", { name: "Add Reference Work" }));
    expect(within(form).getByRole("alert").textContent).toContain("Title is required.");
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
