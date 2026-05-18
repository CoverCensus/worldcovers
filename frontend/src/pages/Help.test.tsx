import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Help from "./Help";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock("marked", () => ({
  marked: {
    parse: (md: string) => `<p>${md}</p>`,
  },
}));

describe("Help page", () => {
  const docsPayload = [
    {
      slug: "glossary",
      title: "System Glossary",
      source_file: "help/glossary.md",
      markdown: "Glossary content",
    },
    {
      slug: "faq-general",
      title: "Frequently Asked Questions",
      source_file: "help/faq.md",
      markdown: "FAQ content",
    },
    {
      slug: "other-notes",
      title: "Other Notes",
      source_file: "help/notes.md",
      markdown: "Other content",
    },
  ];

  const renderWithRoute = (initialPath: string = "/help") =>
    render(
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/help" element={<Help />} />
          <Route path="/help/:docSlug" element={<Help />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    mockNavigate.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: docsPayload }),
    } as Response);
  });

  it("loads help docs and shows first document content by default", async () => {
    renderWithRoute();

    expect(screen.getByRole("heading", { name: /help/i })).toBeInTheDocument();
    expect(screen.getByText(/loading help documents/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/v2/help-docs/");
      expect(
        screen.queryByText(/loading help documents/i),
      ).not.toBeInTheDocument();
    });

    expect(screen.queryByText(/no help documents found/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /system glossary/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/glossary content/i)).toBeInTheDocument();
  });

  it("selects document from route param when present", async () => {
    renderWithRoute("/help/faq-general");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: /frequently asked questions/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/faq content/i)).toBeInTheDocument();
  });

  it("filters documents based on search query and shows no-match message", async () => {
    const user = userEvent.setup();
    renderWithRoute();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const searchInput = await screen.findByPlaceholderText(/search docs/i);
    await user.type(searchInput, "nonexistent-term");

    await waitFor(() => {
      expect(
        screen.getByText(/no documents match your search/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/select a document to view its content/i),
    ).toBeInTheDocument();
  });

  it("shows fallback message when API fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network down"));

    renderWithRoute();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(screen.getByText(/no help documents found/i)).toBeInTheDocument();
  });
});

