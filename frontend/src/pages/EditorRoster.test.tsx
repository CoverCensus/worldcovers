/**
 * @jest-environment jsdom
 */
// issues.md 177 / Trello T46 -- the Editors-only roster page.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EditorRoster from "./EditorRoster";
import { getEditorRoster } from "@/services/editorRoster";

jest.mock("@/components/Navigation", () => ({ Navigation: () => null }));
jest.mock("@/components/Footer", () => ({ Footer: () => null }));
jest.mock("@/services/editorRoster", () => ({
  __esModule: true,
  getEditorRoster: jest.fn(),
}));
const mockedGet = getEditorRoster as jest.Mock;

function renderPage() {
  return render(
    <MemoryRouter>
      <EditorRoster />
    </MemoryRouter>,
  );
}

describe("EditorRoster page", () => {
  beforeEach(() => mockedGet.mockReset());

  it("lists Editor names by state without showing email addresses", async () => {
    mockedGet.mockResolvedValue([
      {
        abbrev: "MD", name: "Maryland",
        editors: [{ displayName: "mdeditor", email: "md@example.com", states: ["MD", "VA"] }],
      },
      {
        abbrev: "VA", name: "Virginia",
        editors: [
          { displayName: "mdeditor", email: "md@example.com", states: ["MD", "VA"] },
          { displayName: "Vera Adams", email: "va@example.com", states: ["VA"] },
        ],
      },
    ]);
    renderPage();
    expect(await screen.findByText("Virginia")).toBeTruthy();
    const navigation = within(screen.getByRole("navigation", { name: "Editor navigation" }));
    expect(navigation.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "My Submissions", "User Submissions", "Editors", "Reference Works",
    ]);
    expect(navigation.getByRole("link", { name: "Editors" }).getAttribute("aria-current")).toBe("page");
    expect(navigation.getByRole("link", { name: "User Submissions" }).getAttribute("href")).toBe("/dashboard?tab=editor");
    expect(screen.getByText("Maryland")).toBeTruthy();
    expect(screen.queryByText(/@example\.com/)).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.getAllByText("Vera Adams").length).toBe(1);
    // An editor of two states appears under both.
    expect(screen.getAllByText("mdeditor").length).toBe(2);
  });

  it("says so when there are no assignments yet", async () => {
    mockedGet.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no state editors are assigned yet/i)).toBeTruthy();
  });

  it("shows the error instead of an empty table when the request fails", async () => {
    mockedGet.mockRejectedValue(new Error("Forbidden"));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Forbidden/)).toBeTruthy());
  });
});
