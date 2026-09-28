/**
 * @jest-environment jsdom
 */
// issues.md 107 — one month/day/year input shared by the cover form, the
// marking form and the Dates seen card. It emits a PartialDateInput and does
// nothing clever: digits only, two for the day, four for the year.
import { fireEvent, render, screen } from "@testing-library/react";
import { PartialDateFields } from "./PartialDateFields";

const EMPTY = { unknown: false, year: "", month: "", day: "" };

describe("PartialDateFields", () => {
  it("emits the typed day and year, digits only", () => {
    const onChange = jest.fn();
    render(<PartialDateFields idPrefix="d" value={EMPTY} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "18a51" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, year: "1851" });
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "123" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, day: "12" });
  });

  it("shows the current value and an error message", () => {
    render(
      <PartialDateFields
        idPrefix="d"
        value={{ unknown: false, year: "1851", month: "3", day: "" }}
        onChange={() => {}}
        error="Day must be between 1 and 31."
      />,
    );
    expect((screen.getByLabelText("Year") as HTMLInputElement).value).toBe("1851");
    expect(screen.getByText("Day must be between 1 and 31.")).toBeTruthy();
  });

  it("hides the Date unknown box unless asked for it", () => {
    const { rerender } = render(<PartialDateFields idPrefix="d" value={EMPTY} onChange={() => {}} />);
    expect(screen.queryByLabelText("Date unknown")).toBeNull();
    rerender(<PartialDateFields idPrefix="d" value={EMPTY} onChange={() => {}} showUnknown />);
    expect(screen.getByLabelText("Date unknown")).toBeTruthy();
  });
});
