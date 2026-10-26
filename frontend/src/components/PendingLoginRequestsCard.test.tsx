/**
 * @jest-environment jsdom
 */
// Trello T84 -- Administrators see who is waiting for an account, with a link into the admin.
import { render, screen, waitFor } from "@testing-library/react";
import { getPendingLoginRequests } from "@/services/loginRequests";
import { PendingLoginRequestsCard } from "./PendingLoginRequestsCard";

jest.mock("@/services/loginRequests", () => ({ getPendingLoginRequests: jest.fn() }));

const mockGet = getPendingLoginRequests as jest.Mock;

describe("PendingLoginRequestsCard", () => {
  beforeEach(() => mockGet.mockReset());

  it("lists each request with a link to its admin page and the count in the title", async () => {
    mockGet.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 12, firstName: "Nina", lastName: "Newcomer", email: "nina@example.com",
          requestedAt: "2026-10-17T14:00:00Z", adminUrl: "/admin/auth/user/12/change/",
        },
        {
          id: 13, firstName: "", lastName: "", email: "nameless@example.com",
          requestedAt: "", adminUrl: "/admin/auth/user/13/change/",
        },
      ],
    });
    render(<PendingLoginRequestsCard />);

    const link = (await screen.findByRole("link", { name: "Nina Newcomer" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/auth/user/12/change/");
    expect(screen.getByText(/Pending login requests \(2\)/).textContent).toContain("(2)");
    // A request with no name falls back to the email so the row is never blank.
    screen.getByRole("link", { name: "nameless@example.com" });
    expect(screen.queryByText(/Showing the newest/)).toBeNull();
  });

  it("says when the server capped the list, and counts everything", async () => {
    mockGet.mockResolvedValue({
      count: 350,
      results: [{ id: 1, firstName: "A", lastName: "B", email: "a@example.com", requestedAt: "", adminUrl: "/admin/auth/user/1/change/" }],
    });
    render(<PendingLoginRequestsCard />);
    await screen.findByText(/Pending login requests \(350\)/);
    screen.getByText("Showing the newest 1 of 350.");
  });

  it("says when nothing is waiting", async () => {
    mockGet.mockResolvedValue({ count: 0, results: [] });
    render(<PendingLoginRequestsCard />);
    await screen.findByText("No requests are waiting.");
  });

  it("shows the server's error instead of an empty list", async () => {
    // lib/api.ts rejects with an Error carrying the server's detail as its message.
    mockGet.mockRejectedValue(new Error("You do not have permission to perform this action."));
    render(<PendingLoginRequestsCard />);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("do not have permission");
    });
  });
});
