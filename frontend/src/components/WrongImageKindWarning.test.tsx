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
    expect(screen.getByText(/submit it with this marking using the Cover section/)).toBeTruthy();
    expect(screen.getByText(/use an existing Cover record/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("offers a Cover draft instead of the Cover section on a Marking edit (T92)", () => {
    render(
      <WrongImageKindWarning
        expected="MARKING"
        count={1}
        editing
        action={<button type="button">Make this a Cover for this Marking</button>}
      />,
    );
    expect(screen.getByText(/may show a whole Cover/)).toBeTruthy();
    expect(screen.getByText(/becomes a Cover draft you finish and submit separately/)).toBeTruthy();
    expect(screen.queryByText(/using the Cover section/)).toBeNull();
    expect(screen.getByRole("button", { name: /Make this a Cover for this Marking/ })).toBeTruthy();
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
