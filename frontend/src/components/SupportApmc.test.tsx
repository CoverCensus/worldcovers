/**
 * @jest-environment jsdom
 */
// Trello T99: the Support block hands the visitor to PayPal on the Society's account.
import { render, screen } from "@testing-library/react";
import { SupportApmc } from "./SupportApmc";
import { DONATE_URL, ORG_NAME, ORG_URL } from "@/constants/brand";

describe("SupportApmc (T99)", () => {
  it("shows the heading and a Donate link that opens PayPal in a new tab", () => {
    render(<SupportApmc />);
    screen.getByRole("heading", { name: "Support the APMC" });
    const donate = screen.getByRole("link", { name: "Donate via PayPal" });
    expect(donate.getAttribute("href")).toBe(DONATE_URL);
    expect(donate.getAttribute("target")).toBe("_blank");
    expect(donate.getAttribute("rel")).toContain("noopener");
    const society = screen.getByRole("link", { name: ORG_NAME });
    expect(society.getAttribute("href")).toBe(ORG_URL);
  });

  it("points at PayPal's donate endpoint, never a cart session", () => {
    expect(DONATE_URL.startsWith("https://www.paypal.com/donate/?")).toBe(true);
    expect(DONATE_URL).not.toContain("shoppingcart");
  });
});
