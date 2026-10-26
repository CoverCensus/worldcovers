/**
 * @jest-environment jsdom
 */
// Trello T71 -- the inline form that adds or corrects a postmaster event.
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PostmasterEventForm } from "./PostmasterEventForm";
import {
  createPostmaster,
  createTenure,
  searchPostmasters,
  type PostmasterTenure,
} from "@/services/postmasters";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));
jest.mock("@/services/postmasters", () => ({
  ...jest.requireActual("@/services/postmasters"),
  searchPostmasters: jest.fn(),
  createPostmaster: jest.fn(),
  createTenure: jest.fn(),
  updateTenure: jest.fn(),
}));

const saved: PostmasterTenure = {
  id: 9, postOfficeId: 7, postOfficeName: "Richmond", postmasterId: 3, postmasterName: "Gerrard T. Conn",
  event: "appointment", dateAppointed: "1801-01-01", granularity: "YEAR", sourceRef: "", origin: "MANUAL",
  sourceNote: "Register, p. 12",
};

function renderForm(onSaved = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <PostmasterEventForm postOfficeId={7} existing={null} onSaved={onSaved} onCancel={jest.fn()} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return onSaved;
}

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (searchPostmasters as jest.Mock).mockResolvedValue([{ id: 3, name: "Gerrard T. Conn", sortName: "Conn, Gerrard T." }]);
  (createTenure as jest.Mock).mockResolvedValue(saved);
  (createPostmaster as jest.Mock).mockResolvedValue({ id: 44, name: "Someone New", sortName: "New, Someone" });
});

describe("PostmasterEventForm", () => {
  it("posts an existing person, a year-only date and the note", async () => {
    const user = userEvent.setup();
    const onSaved = renderForm();
    await user.type(screen.getByLabelText("Person"), "Conn");
    // The match list always offers a new person beside the matches: a name is not an identity.
    const match = await screen.findByRole("button", { name: /Gerrard T\. Conn/ });
    expect(screen.getByText(/Add new person:/)).toBeInTheDocument();
    await user.click(match);
    await user.type(screen.getByLabelText("Year"), "1801");
    await user.type(screen.getByRole("textbox", { name: /Source note/ }), "Register, p. 12");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => expect(createTenure).toHaveBeenCalledTimes(1));
    expect(createTenure).toHaveBeenCalledWith({
      post_office: 7, postmaster: 3, event: "appointment",
      date_appointed: "1801-01-01", date_appointed_granularity: "YEAR", source_note: "Register, p. 12",
    });
    expect(createPostmaster).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(mockToast).toHaveBeenCalled();
  });

  it("creates a new person first when none is picked", async () => {
    const user = userEvent.setup();
    (searchPostmasters as jest.Mock).mockResolvedValue([]);
    renderForm();
    await user.type(screen.getByLabelText("Person"), "Someone New");
    await screen.findByText(/Add new person:/);
    await user.type(screen.getByLabelText("Year"), "1840");
    await user.type(screen.getByRole("textbox", { name: /Source note/ }), "Postal guide 1840");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => expect(createTenure).toHaveBeenCalledTimes(1));
    expect(createPostmaster).toHaveBeenCalledWith("Someone New", "");
    expect(createTenure).toHaveBeenCalledWith(expect.objectContaining({ postmaster: 44, date_appointed: "1840-01-01" }));
  });

  it("blocks submit without a source note and names the problem", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Person"), "Conn");
    await user.click(await screen.findByRole("button", { name: /Gerrard T\. Conn/ }));
    await user.click(screen.getByRole("button", { name: "Add event" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/source note is required/);
    expect(createTenure).not.toHaveBeenCalled();
  });

  it("keeps the form open with the server's message when the API refuses", async () => {
    const user = userEvent.setup();
    (createTenure as jest.Mock).mockRejectedValue(new Error("You are not assigned to the region this post office belongs to."));
    const onSaved = renderForm();
    await user.type(screen.getByLabelText("Person"), "Conn");
    await user.click(await screen.findByRole("button", { name: /Gerrard T\. Conn/ }));
    await user.type(screen.getByRole("textbox", { name: /Source note/ }), "x");
    await user.click(screen.getByRole("button", { name: "Add event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not assigned to the region/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Add postmaster event" })).toBeInTheDocument();
  });
});
