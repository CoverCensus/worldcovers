/**
 * @jest-environment jsdom
 */
// Trello T99: the Support block hands the visitor to PayPal on the Society's account.
import { render, screen } from "@testing-library/react";
import { SupportApmc } from "./SupportApmc";
import { NEW_TAB_HINT } from "./ExternalLink";
import { DONATE_URL, ORG_NAME, ORG_URL } from "@/constants/brand";

describe("SupportApmc (T99)", () => {
  it("shows the heading and a Donate link that opens PayPal in a new tab", () => {
    render(<SupportApmc />);
    screen.getByRole("heading", { name: "Support the APMC" });
    const donate = screen.getByRole("link", { name: "Donate via PayPal" });
    expect(donate.getAttribute("href")).toBe(DONATE_URL);
    expect(donate.getAttribute("target")).toBe("_blank");
    expect(donate.getAttribute("rel")).toContain("noopener");
    const hint = document.getElementById(donate.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe(NEW_TAB_HINT);
    const society = screen.getByRole("link", { name: ORG_NAME });
    expect(society.getAttribute("href")).toBe(ORG_URL);
  });
});
