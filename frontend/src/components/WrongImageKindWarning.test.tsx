/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";

import { WrongImageKindWarning } from "./WrongImageKindWarning";

describe("WrongImageKindWarning (issue #76)", () => {
  it("renders nothing when no image looks wrong", () => {
    const { container } = render(
      <WrongImageKindWarning
        expected="MARKING"
        count={0}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("tells a marking submitter their image may show a cover", () => {
    render(
      <WrongImageKindWarning
        expected="MARKING"
        count={1}
      />,
    );
    expect(screen.getByText(/may show a whole Cover/)).toBeTruthy();
    expect(screen.getByText(/Create a new Cover record/)).toBeTruthy();
    expect(screen.getByText(/use an existing Cover record/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("reverses the message on the cover form", () => {
    render(
      <WrongImageKindWarning
        expected="COVER"
        count={1}
      />,
    );
    expect(screen.getByText(/looks like a marking close-up/i)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says how many images are affected when there is more than one", () => {
    render(
      <WrongImageKindWarning
        expected="MARKING"
        count={3}
      />,
    );
    expect(screen.getByText(/3 of the images/i)).toBeTruthy();
  });
});
