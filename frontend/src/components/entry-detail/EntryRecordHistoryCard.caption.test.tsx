/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { EntryRecordHistoryCard } from "./EntryRecordHistoryCard";

it("shows the old and new caption on an Image caption changed entry", () => {
  render(<EntryRecordHistoryCard
    loading={false}
    error={null}
    expanded={false}
    onToggleExpanded={() => {}}
    events={[{
      event_id: 1, transaction_uuid: "u", timestamp: "2026-10-19T14:00:00Z",
      action: "image_caption_changed", action_label: "Image caption changed",
      actor: "editor", actor_email: "editor@example.com", source: "editor_portal",
      contribution_id: null, version_no: 2, summary: "", diff: [{ field: "images", before: [], after: [] }],
      caption_change: { previous: "Front", caption: "" },
    }]}
  />);
  expect(screen.getByText("Image caption changed")).toBeTruthy();
  expect(screen.getByText(': "Front" -> (none)')).toBeTruthy();
  expect(screen.queryByText("Images")).toBeNull();
});
