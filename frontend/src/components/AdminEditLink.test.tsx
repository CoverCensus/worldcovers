/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AuthUser } from "@/lib/auth";
import { AdminEditLink } from "./AdminEditLink";

const superuser: AuthUser = {
  id: 1,
  username: "admin",
  email: "",
  is_staff: true,
  is_superuser: true,
};

function renderLink(user: AuthUser | null, kind: "marking" | "cover", recordId: number | null) {
  const openCard = jest.fn();
  render(
    <TooltipProvider>
      <div data-testid="card" onClick={openCard} onKeyDown={openCard}>
        <AdminEditLink user={user} kind={kind} recordId={recordId} />
      </div>
    </TooltipProvider>,
  );
  return openCard;
}

describe("AdminEditLink", () => {
  it("shows exact admin change URLs in the current tab", () => {
    renderLink(superuser, "marking", 21032);
    const marking = screen.getByRole("link", { name: "Edit Marking in Django admin" });
    expect(marking.getAttribute("href")).toBe("/admin/common/marking/21032/change/");
    expect(marking.hasAttribute("target")).toBe(false);

    renderLink(superuser, "cover", 42);
    const cover = screen.getByRole("link", { name: "Edit Cover in Django admin" });
    expect(cover.getAttribute("href")).toBe("/admin/common/cover/42/change/");
    expect(cover.hasAttribute("target")).toBe(false);
  });

  it.each([
    ["Guest", null],
    ["Contributor", { ...superuser, is_staff: false, is_superuser: false, role: "contributor" }],
    ["Editor", { ...superuser, is_staff: true, is_superuser: false, role: "editor" }],
    ["staff without Superuser", { ...superuser, is_superuser: false }],
  ])("hides the link for %s", (_role, user) => {
    renderLink(user, "marking", 21032);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([null, 0, -1, 1.5, Number.NaN])("hides invalid record ID %s", (recordId) => {
    renderLink(superuser, "cover", recordId);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps link activation from opening its parent card", () => {
    const openCard = renderLink(superuser, "cover", 42);
    const link = screen.getByRole("link", { name: "Edit Cover in Django admin" });
    expect(fireEvent.click(link)).toBe(true);
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(true);
    expect(openCard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("card"));
    expect(openCard).toHaveBeenCalledTimes(1);
  });
});
