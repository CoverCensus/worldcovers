/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import { LowResolutionImageWarning } from "./LowResolutionImageWarning";

describe("LowResolutionImageWarning", () => {
  it("renders nothing when no selected image is below 300 DPI", () => {
    const { container } = render(<LowResolutionImageWarning count={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("recommends a better image without blocking submission", () => {
    render(<LowResolutionImageWarning count={1} />);
    expect(screen.getByText("Image may be low quality")).toBeTruthy();
    expect(screen.getByText(/prefer images at 300 DPI or higher/)).toBeTruthy();
    expect(screen.getByText(/higher-resolution scan or photograph/)).toBeTruthy();
    expect(screen.getByText(/still submit this image/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("reports the affected count for several images", () => {
    render(<LowResolutionImageWarning count={2} />);
    expect(screen.getByText(/2 of the images/)).toBeTruthy();
  });
});
