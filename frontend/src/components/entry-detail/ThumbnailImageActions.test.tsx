/**
 * @jest-environment jsdom
 */
/**
 * issues.md 166 -- the crop control was invisible until the image was saved.
 *
 * A Delaware editor uploaded a cover photograph into the marking form and saw
 * only the star and two arrows. He was looking for the crop icon, which was
 * working correctly but hidden because the unsaved image had no catalog id.
 * Nothing on screen said so. He lost two days and split one record into two.
 *
 * These pin the behaviour that replaces the silent hide: the controls stay on
 * screen, disabled, with the reason rendered as visible text.
 */
import { render, screen } from "@testing-library/react";

import { ThumbnailImageActions } from "./ThumbnailImageActions";
import { imageActionState } from "@/lib/imageActionState";

const noop = () => {};

const renderActions = (
  state: ReturnType<typeof imageActionState>,
  overrides: Partial<Parameters<typeof ThumbnailImageActions>[0]> = {},
) =>
  render(
    <ThumbnailImageActions
      state={state}
      canReorder
      isFirst={false}
      isLast={false}
      isDefault={false}
      reordering={false}
      deleting={false}
      onMoveBy={noop}
      onSetDefault={noop}
      onCrop={noop}
      onCreateCoverFromImage={noop}
      onDelete={noop}
      {...overrides}
    />,
  );

const crop = () => screen.getByRole("button", { name: "Crop the marking out of this image" });

describe("ThumbnailImageActions", () => {
  it("keeps crop and move on screen, disabled, when the image is not saved yet", () => {
    renderActions(imageActionState({ imageId: null, isStaff: true, isRemoved: false }));

    // Present, not absent -- this is the whole fix.
    expect(crop().hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Create a cover from this image" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("says why the controls cannot be used, in text rather than a tooltip", () => {
    renderActions(imageActionState({ imageId: null, isStaff: true, isRemoved: false }));

    // getByText searches rendered text content, so this fails if the reason is
    // only carried on a `title` attribute.
    expect(screen.getByText(/has not been saved to the catalog yet/i)).toBeTruthy();
  });

  it("enables the controls for a saved image on a live marking", () => {
    renderActions(imageActionState({ imageId: 5869, isStaff: true, isRemoved: false }));

    expect(crop().hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(/has not been saved/i)).toBeNull();
  });

  it("no longer offers to move an image to another marking", () => {
    // Removed 2026-09-21. Ian asked twice -- editors did not understand what
    // "move" meant, and the second request was unhedged. Pinned so it does not
    // reappear with a rename.
    renderActions(imageActionState({ imageId: 5869, isStaff: true, isRemoved: false }));

    expect(screen.queryByRole("button", { name: /another marking/i })).toBeNull();
  });

  it("renders nothing at all for a visitor without editor rights", () => {
    const { container } = renderActions(
      imageActionState({ imageId: 5869, isStaff: false, isRemoved: false }),
    );

    // A disabled control still advertises a capability, so non-staff get none.
    expect(container.innerHTML).toBe("");
  });

  it("offers to create a cover even when the marking has none yet", () => {
    // The old "Move to cover" was hidden unless a cover already existed, which
    // is precisely the dead end a Delaware editor hit and lost a record to.
    // Creating the destination needs no destination.
    renderActions(imageActionState({ imageId: 5869, isStaff: true, isRemoved: false }));

    expect(
      screen.getByRole("button", { name: "Create a cover from this image" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByRole("button", { name: /move image to a cover/i })).toBeNull();
  });
});
