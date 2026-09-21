/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

jest.mock("@/assets/image-not-available.jpg", () => "image-not-available.jpg");

import { EntryAssociatedThumbnailsCard } from "./EntryAssociatedThumbnailsCard";
import type { EntryGalleryImage } from "./types";

const images: EntryGalleryImage[] = [
  {
    imageUrl: "/first.jpg",
    originalFilename: "first.jpg",
    isDefault: true,
    isTracing: false,
    imageId: 1,
  },
  {
    imageUrl: "/second.jpg",
    originalFilename: "second.jpg",
    isDefault: false,
    isTracing: false,
    imageId: 2,
  },
];

describe("EntryAssociatedThumbnailsCard", () => {
  it("groups reorder and record actions into separate rows", () => {
    render(
      <EntryAssociatedThumbnailsCard
        images={images}
        carouselApi={undefined}
        currentIndex={0}
        emptyMessage="No images"
        canReorder
        onMoveBy={jest.fn()}
        onSetDefault={jest.fn()}
        onMoveImage={jest.fn()}
        onDeleteImage={jest.fn()}
      />,
    );

    const left = screen.getAllByRole("button", { name: "Move thumbnail left" })[0];
    const setDefault = screen.getAllByRole("button", {
      name: "Set as default catalog thumbnail",
    })[0];
    const move = screen.getAllByRole("button", {
      name: "Move image to another record",
    })[0];
    const remove = screen.getAllByRole("button", { name: "Delete image" })[0];

    expect(left.parentElement).toBe(setDefault.parentElement);
    expect(move.parentElement).toBe(remove.parentElement);
    expect(left.parentElement).not.toBe(move.parentElement);
  });

  it("shows record actions without an empty reorder row for one image", () => {
    render(
      <EntryAssociatedThumbnailsCard
        images={[images[0]]}
        carouselApi={undefined}
        currentIndex={0}
        emptyMessage="No images"
        canReorder={false}
        onMoveImage={jest.fn()}
        onDeleteImage={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Move thumbnail left" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move image to another record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete image" })).toBeTruthy();
  });
});
