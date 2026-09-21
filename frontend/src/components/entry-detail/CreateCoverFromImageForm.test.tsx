/**
 * @jest-environment jsdom
 */
/**
 * issues.md 167 / Trello T37 -- the form that turns a marking image into a
 * cover.
 *
 * Ian's requirement is "all is needed is the date". These pin that literally:
 * the date fields are the only thing asked for, and the one situation that can
 * damage a record -- moving away a marking's last picture -- is called out
 * where the editor will see it.
 *
 * Rendered without the Radix <Dialog> wrapper on purpose; the wrapper stays in
 * RecordDetail and is never driven by a test.
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { CreateCoverFromImageForm } from "./CreateCoverFromImageForm";
import type { PartialDateInput } from "@/lib/partialDate";

const emptyDate: PartialDateInput = { unknown: false, year: "", month: "", day: "" };

const renderForm = (over: Partial<Parameters<typeof CreateCoverFromImageForm>[0]> = {}) =>
  render(
    <CreateCoverFromImageForm
      date={emptyDate}
      onDateChange={() => {}}
      isBackstamp={false}
      onBackstampChange={() => {}}
      imageView="FRONT"
      onImageViewChange={() => {}}
      isOnlyImage={false}
      onCropFirst={() => {}}
      busy={false}
      error={null}
      {...over}
    />,
  );

describe("CreateCoverFromImageForm", () => {
  it("asks for the date and says a year is enough", () => {
    renderForm();

    expect(screen.getByLabelText("Year")).toBeTruthy();
    expect(screen.getByLabelText("Month")).toBeTruthy();
    expect(screen.getByLabelText("Day")).toBeTruthy();
    expect(screen.getByText(/a year is enough/i)).toBeTruthy();
  });

  it("shows how a partial date will be recorded before the editor commits", () => {
    renderForm({ date: { unknown: false, year: "1847", month: "8", day: "" } });

    // Month-only precision is a real claim about the observation, so the
    // editor should see it stated rather than inferred.
    expect(screen.getByText(/AUG, 1847/)).toBeTruthy();
  });

  it("reports each date field as the editor types", () => {
    const onDateChange = jest.fn();
    renderForm({ onDateChange });

    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "1847" } });

    expect(onDateChange).toHaveBeenCalledWith({
      unknown: false,
      year: "1847",
      month: "",
      day: "",
    });
  });

  it("warns that the marking will be left with no picture when this is its only image", () => {
    renderForm({ isOnlyImage: true });

    expect(screen.getByTestId("only-image-warning")).toBeTruthy();
    // Spoonfed, not blocked: the way out is offered right there.
    expect(screen.getByRole("button", { name: /crop the marking out first/i })).toBeTruthy();
  });

  it("stays quiet about the last image when the marking has others", () => {
    renderForm();
    expect(screen.queryByTestId("only-image-warning")).toBeNull();
  });

  it("offers only cover-side views, never a marking view", () => {
    renderForm();

    const options = Array.from(
      screen.getByLabelText(/which side of the cover/i).querySelectorAll("option"),
    ).map((o) => (o as HTMLOptionElement).value);

    // The serializer rejects FULL on a COVER subject.
    expect(options).toEqual(["FRONT", "BACK", "INTERIOR", "DETAIL"]);
    expect(options).not.toContain("FULL");
  });

  it("locks the fields while the records are being written", () => {
    renderForm({ busy: true });
    expect((screen.getByLabelText("Year") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows a failure where the editor is looking", () => {
    renderForm({ error: "Cover #42 was created but could not be linked." });
    expect(screen.getByRole("alert").textContent).toContain("Cover #42");
  });
});
