import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Collections from "./Collections";
import apiClient from "@/lib/api";
import {
  listCollections,
  createCollection,
  listCollectionEditors,
  deleteCollection,
} from "@/services/collections";

const mockToast = jest.fn();

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock("@/services/collections", () => ({
  listCollections: jest.fn(),
  createCollection: jest.fn(),
  deleteCollection: jest.fn(),
  listCollectionEditors: jest.fn(),
  assignEditor: jest.fn(),
  unassignEditor: jest.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Collections />
    </MemoryRouter>
  );

describe("Collections page", () => {
  beforeEach(() => {
    mockToast.mockReset();
    jest.mocked(listCollections).mockResolvedValue([]);
    jest.mocked(listCollectionEditors).mockResolvedValue([]);
    jest.mocked(createCollection).mockResolvedValue({ id: 10 } as never);
    jest.mocked(apiClient.get).mockResolvedValue({
      data: [{ id: 1, name: "Virginia", abbrev: "VA" }],
    } as never);
  });

  it("renders heading and empty-state text", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: /collection administration/i })
    ).toBeInTheDocument();
    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
  });

  it("renders collection rows when API returns data", async () => {
    jest.mocked(listCollections).mockResolvedValueOnce([
      {
        id: 1,
        name: "VA Collection",
        description: "desc",
        is_active: true,
        editor_count: 2,
        region: { id: 1, name: "Virginia", abbrev: "VA" },
      },
    ] as never);

    renderPage();

    expect(await screen.findByText(/va collection/i)).toBeInTheDocument();
    expect(screen.getByText(/virginia/i)).toBeInTheDocument();
  });

  it("shows validation toast when create is attempted without required fields", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new collection/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Name and Region are required.", variant: "destructive" })
      );
    });
    expect(createCollection).not.toHaveBeenCalled();
  });

  it("creates collection when name and region are provided", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new collection/i }));
    await user.type(screen.getByLabelText(/^name$/i), "New VA Coll");
    await user.selectOptions(screen.getByLabelText(/^region$/i), "1");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New VA Coll",
          region_id: 1,
        }),
      );
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Collection created." }));
    });
  });

  it("loads editors when a collection row is selected", async () => {
    const user = userEvent.setup();
    jest.mocked(listCollections).mockResolvedValueOnce([
      {
        id: 7,
        name: "Pick Me",
        description: "",
        is_active: true,
        editor_count: 0,
        region: { id: 1, name: "Virginia", abbrev: "VA" },
      },
    ] as never);
    jest.mocked(listCollectionEditors).mockResolvedValueOnce([
      { id: 1, user_id: 42, username: "editor1", email: "e@example.com" },
    ] as never);

    renderPage();

    await user.click(await screen.findByText(/pick me/i));
    await waitFor(() => {
      expect(listCollectionEditors).toHaveBeenCalledWith(7);
    });
    expect(await screen.findByText(/editor1/i)).toBeInTheDocument();
  });

  it("deletes collection after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.mocked(listCollections).mockResolvedValueOnce([
      {
        id: 9,
        name: "Delete Me",
        description: "",
        is_active: true,
        editor_count: 0,
        region: { id: 1, name: "Virginia", abbrev: "VA" },
      },
    ] as never);
    jest.mocked(deleteCollection).mockResolvedValue(undefined);

    renderPage();

    await user.click(await screen.findByText(/delete me/i));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteCollection).toHaveBeenCalledWith(9);
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Collection deleted." }));
    });
    confirmSpy.mockRestore();
  });
});
