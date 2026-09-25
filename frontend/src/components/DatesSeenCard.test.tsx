/**
 * @jest-environment jsdom
 */
// issues.md 107 — Greg Stone: "When editing a listing, I don't see where the
// dates seen can be modified." Todd Hause: "'Dates Seen' ... is not available
// ... Where does this data come?" This card is the answer, on the marking page.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DatesSeenCard } from "./DatesSeenCard";
import { createDateSeen, deleteDateSeen, updateDateSeen } from "@/services/datesSeen";

jest.mock("@/services/datesSeen", () => ({
  __esModule: true,
  createDateSeen: jest.fn(),
  updateDateSeen: jest.fn(),
  deleteDateSeen: jest.fn(),
  dateSeenErrorMessage: (err: unknown) =>
    (err as { response?: { data?: { non_field_errors?: string[] } } })?.response?.data?.non_field_errors?.[0]
    ?? (err instanceof Error ? err.message : "Could not save the date."),
}));
const mockCreate = createDateSeen as jest.Mock;
const mockUpdate = updateDateSeen as jest.Mock;
const mockDelete = deleteDateSeen as jest.Mock;

const rows = [
  { id: 1, date: "1851-02-10", granularity: "DAY" as const, dateYear: 1851, dateMonth: 2, dateDay: 10 },
  { id: 2, date: null, granularity: "MONTH_ONLY" as const, dateYear: null, dateMonth: 6, dateDay: null },
  { id: 3, date: "1832-01-01", granularity: "YEAR" as const, dateYear: 1832, dateMonth: null, dateDay: null },
];

function renderCard(over: Partial<React.ComponentProps<typeof DatesSeenCard>> = {}) {
  const onChanged = jest.fn().mockResolvedValue(undefined);
  render(<DatesSeenCard markingId={7} datesSeen={rows} onChanged={onChanged} {...over} />);
  return { onChanged };
}

describe("DatesSeenCard", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it("lists the dates earliest first at their own precision and badges the ones that do not set the range", () => {
    renderCard();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("1832");
    expect(items[1]).toContain("02/10/1851");
    expect(items[2]).toContain("JUN (year unknown)");
    expect(items[2]).toContain("Not used for Earliest/Latest");
    expect(items[0]).not.toContain("Not used for Earliest/Latest");
  });

  it("adds a date with the typed parts and tells the page to refetch", async () => {
    mockCreate.mockResolvedValue({ id: 4 });
    const { onChanged } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /add date/i }));
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1840" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
      subjectType: "MARKING",
      subjectId: 7,
      parts: { unknown: false, year: "1840", month: "", day: "" },
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("surfaces the server's message when the date is a duplicate", async () => {
    mockCreate.mockRejectedValue({ response: { data: { non_field_errors: ["This date is already recorded for this record."] } } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /add date/i }));
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1832" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText("This date is already recorded for this record.")).toBeTruthy();
  });

  it("removes a date after confirmation", async () => {
    mockDelete.mockResolvedValue(undefined);
    const { onChanged } = renderCard();
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /remove date/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(3)); // earliest row is first
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("edits a date by sending all three parts", async () => {
    mockUpdate.mockResolvedValue({ id: 3 });
    renderCard();
    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1833" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(3, { unknown: false, year: "1833", month: "", day: "" }));
  });

  it("says where the dates come from and shows the empty state", () => {
    renderCard({ datesSeen: [] });
    expect(screen.getByText(/come from the source catalogue text and from editors/i)).toBeTruthy();
    expect(screen.getByText(/no dates recorded directly on this marking/i)).toBeTruthy();
  });
});
