import { render, screen } from "@testing-library/react";
import MySuggestions from "./MySuggestions";

jest.mock("./Dashboard", () => ({
  __esModule: true,
  default: ({ initialTab }: { initialTab?: string }) => (
    <div data-testid="dashboard-proxy">tab:{initialTab}</div>
  ),
}));

describe("MySuggestions page", () => {
  it("renders Dashboard with initialTab=suggestions", () => {
    render(<MySuggestions />);
    expect(screen.getByTestId("dashboard-proxy")).toHaveTextContent("tab:suggestions");
  });
});
