/** @jest-environment jsdom */
// Trello T110: each upload tile offers the picked file at full size.
import { fireEvent, render, screen } from "@testing-library/react";
import { OpenFullSizeLink } from "./OpenFullSizeLink";

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => "blob:full-size");
  global.URL.revokeObjectURL = jest.fn();
});
beforeEach(() => jest.clearAllMocks());

it("opens a picked file in a new tab through a blob URL and releases it on unmount", () => {
  const file = new File(["x"], "scan.jpg", { type: "image/jpeg" });
  const { unmount } = render(<OpenFullSizeLink file={file} />);
  const link = screen.getByRole("link", { name: "Open full size" });
  expect(link.getAttribute("href")).toBe("blob:full-size");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:full-size");
});

it("uses a stored image's URL as given and makes no blob URL for it", () => {
  render(<OpenFullSizeLink href="/media/va/front.png" />);
  expect(screen.getByRole("link", { name: "Open full size" }).getAttribute("href")).toBe("/media/va/front.png");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("keeps its click and its Enter key from reaching the drop zone around it", () => {
  const parentClick = jest.fn();
  const parentKeyDown = jest.fn();
  render(
    <div onClick={parentClick} onKeyDown={parentKeyDown}>
      <OpenFullSizeLink href="/media/x.png" />
    </div>,
  );
  const link = screen.getByRole("link", { name: "Open full size" });
  fireEvent.click(link);
  fireEvent.keyDown(link, { key: "Enter" });
  expect(parentClick).not.toHaveBeenCalled();
  expect(parentKeyDown).not.toHaveBeenCalled();
});

it("renders nothing without a file or a URL", () => {
  const { container } = render(<OpenFullSizeLink />);
  expect(container.innerHTML).toBe("");
});
