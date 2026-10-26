/** @jest-environment jsdom */
// Trello T74: the dialog shows the server's plan and limitations before an Editor confirms.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RestoreVersionDialog } from "./RestoreVersionDialog";
import type { RestorePreview } from "@/services/markings";

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LIMITATION = "Links between this marking and its covers are not part of a marking version and are left unchanged.";

const preview: RestorePreview = {
  entry_type: "marking",
  entry_id: 5,
  version_no: 2,
  version_created_at: "2026-10-01T12:00:00Z",
  version_action_label: "Approved",
  fields: [
    { key: "inscription_txt", label: "Inscription", current: "CHANGED", proposed: "RICHMOND", changed: true },
    { key: "town", label: "Town", current: "Richmond", proposed: "Richmond", changed: false },
  ],
  relationships: { images: { added: 1, removed: 0, kept: 1, skipped: 0 } },
  limitations: [LIMITATION],
  has_changes: true,
};

function open(overrides: Partial<React.ComponentProps<typeof RestoreVersionDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    entryLabel: "marking" as const,
    versionNo: 2,
    loadPreview: jest.fn().mockResolvedValue({ ok: true, preview }),
    onConfirm: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  render(<RestoreVersionDialog {...props} />);
  return props;
}

it("shows the comparison, relationship counts and limitations, then confirms and closes", async () => {
  const props = open();
  expect(await screen.findByText(/1 of 2 fields change/)).toBeTruthy();
  expect(screen.getByText("Images")).toBeTruthy();
  expect(screen.getByText(": 1 added, 0 removed, 1 kept, 0 skipped")).toBeTruthy();
  expect(screen.getByText("What this restore cannot bring back")).toBeTruthy();
  expect(screen.getByText(LIMITATION)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Restore from version 2" }));
  await waitFor(() => expect(props.onConfirm).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
});

it("keeps the dialog open and shows the server's message when the restore is refused", async () => {
  const props = open({ onConfirm: jest.fn().mockResolvedValue("Restore could not be completed; nothing was changed.") });
  fireEvent.click(await screen.findByRole("button", { name: "Restore from version 2" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Restore could not be completed; nothing was changed.");
  expect(props.onOpenChange).not.toHaveBeenCalled();
});

it("disables the confirm button when the preview fails or nothing would change", async () => {
  open({ loadPreview: jest.fn().mockResolvedValue({ ok: false, message: "You are not allowed to restore this record." }) });
  expect((await screen.findByRole("alert")).textContent).toBe("You are not allowed to restore this record.");
  expect(screen.getByRole("button", { name: "Restore from version 2" }).hasAttribute("disabled")).toBe(true);
});
