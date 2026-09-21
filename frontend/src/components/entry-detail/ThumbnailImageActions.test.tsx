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
      canMoveToCover
      canMoveToMarking
      onMoveBy={noop}
      onSetDefault={noop}
      onCrop={noop}
      onMoveToCover={noop}
      onMoveToMarking={noop}
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
      screen.getByRole("button", { name: "Move image to a cover entry" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Move image to another marking" })
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

  it("renders nothing at all for a visitor without editor rights", () => {
    const { container } = renderActions(
      imageActionState({ imageId: 5869, isStaff: false, isRemoved: false }),
    );

    // A disabled control still advertises a capability, so non-staff get none.
    expect(container.innerHTML).toBe("");
  });

  it("hides a move action when there is nowhere to move to", () => {
    renderActions(imageActionState({ imageId: 5869, isStaff: true, isRemoved: false }), {
      canMoveToCover: false,
      canMoveToMarking: false,
    });

    expect(screen.queryByRole("button", { name: "Move image to a cover entry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move image to another marking" })).toBeNull();
    // Crop is unconditional -- it needs no destination.
    expect(crop().hasAttribute("disabled")).toBe(false);
  });
});
