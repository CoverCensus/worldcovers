/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldHelp } from "./FieldHelp";
import { TooltipProvider } from "@/components/ui/tooltip";

it("opens help from the keyboard without submitting the form and closes with Escape", async () => {
  const user = userEvent.setup();
  const submit = jest.fn((event) => event.preventDefault());
  render(
    <TooltipProvider delayDuration={0}>
      <form onSubmit={submit}>
        <FieldHelp label="Impression">Printing technique of the handstamp.</FieldHelp>
        <button type="submit">Save</button>
      </form>
    </TooltipProvider>,
  );

  await user.tab();
  const help = screen.getByRole("button", { name: "Help for Impression" });
  expect(document.activeElement).toBe(help);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.textContent).toBe("Printing technique of the handstamp.");
  expect(help.getAttribute("aria-describedby")).toBe(tooltip.id);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  await user.keyboard("{Enter}");
  expect(submit).not.toHaveBeenCalled();
});
