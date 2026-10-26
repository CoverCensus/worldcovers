/** @jest-environment jsdom */
// Trello T74: "Restore this version" appears only for events that saved a version, and only when offered.
import { fireEvent, render, screen } from "@testing-library/react";

import { EntryRecordHistoryCard } from "./EntryRecordHistoryCard";
import type { MarkingChangelogEvent } from "@/services/markings";

const event = (overrides: Partial<MarkingChangelogEvent>): MarkingChangelogEvent => ({
  event_id: 1,
  transaction_uuid: "u",
  timestamp: "2026-10-01T12:00:00Z",
  action: "approve",
  action_label: "Approved",
  actor: "editor",
  actor_email: "editor@example.com",
  source: "editor_portal",
  contribution_id: null,
  version_no: 2,
  summary: "Approved by editor",
  diff: [],
  ...overrides,
});

const base = { loading: false, error: null, expanded: false, onToggleExpanded: jest.fn() };

it("offers a restore for versioned events when a handler is passed, and calls it with the version", () => {
  const onRestoreVersion = jest.fn();
  render(
    <EntryRecordHistoryCard
      {...base}
      events={[event({ event_id: 1, version_no: 2 }), event({ event_id: 2, version_no: null, action_label: "Rejected" })]}
      onRestoreVersion={onRestoreVersion}
    />,
  );
  const buttons = screen.getAllByRole("button", { name: /Restore this version/ });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  expect(onRestoreVersion).toHaveBeenCalledWith(2);
});

it("shows no restore control when the page does not offer one", () => {
  render(<EntryRecordHistoryCard {...base} events={[event({ version_no: 2 })]} />);
  expect(screen.queryByRole("button", { name: /Restore this version/ })).toBeNull();
});
