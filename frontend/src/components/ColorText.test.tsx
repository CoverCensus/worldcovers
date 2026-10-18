/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { ColorText } from "./ColorText";
import { CatalogRecordFields } from "./CatalogRecordFields";
import { MarkingFieldsDisplay } from "./MarkingFieldsDisplay";
import { buildCatalogFieldValues } from "@/lib/catalogRecordDisplay";
import { buildMarkingFields } from "@/lib/markingFields";
import { mapApiMarkingToRecord } from "@/services/markings";

jest.mock("@/lib/api", () => ({ __esModule: true, default: {} }));

describe("Color text", () => {
  it.each([
    ["BLACK", "#202020", "rgb(255, 255, 255)"],
    ["RED", "#C62828", "rgb(255, 255, 255)"],
    ["BROWN RED", "#9E3E2F", "rgb(255, 255, 255)"],
    ["BLACK BLUE", "#102B59", "rgb(255, 255, 255)"],
    ["BLACK RED", "#680D18", "rgb(255, 255, 255)"],
    ["PINK", "#E79BB0", "rgb(0, 0, 0)"],
    ["YELLOW", "#E8C52E", "rgb(0, 0, 0)"],
    ["WHITE", "#FFFFFF", "rgb(0, 0, 0)"],
  ])("keeps %s readable without changing its name", (name, hex, background) => {
    render(<ColorText name={name} hex={hex} />);
    const text = screen.getByText(name);
    expect(text.style.color).not.toBe("");
    expect(text.style.backgroundColor).toBe(background);
    expect(text.classList.contains("font-bold")).toBe(true);
  });

  it.each([undefined, "", "red", "#GGGGGG", "url(https://example.com)"])(
    "uses normal text for a missing or invalid hex: %s",
    (hex) => {
      render(<ColorText name="Red" hex={hex} />);
      expect(screen.getByText("Red").getAttribute("style")).toBeNull();
    },
  );

  it("keeps the missing Color marker uncolored", () => {
    render(<ColorText name="-" hex="#C62828" />);
    expect(screen.getByText("-").getAttribute("style")).toBeNull();
  });

  it.each(["list", "gallery", "detail"] as const)(
    "carries the API color through to catalog %s fields",
    (variant) => {
      const record = mapApiMarkingToRecord({
        id: 1, type: "TOWNMARK", color_name: "Red", color_hex: "#C62828",
      });
      render(<CatalogRecordFields row={buildCatalogFieldValues(record)} variant={variant} />);
      expect(screen.getByText("Red").style.color).toBe("rgb(198, 40, 40)");
      expect(screen.getByText("Color:").getAttribute("style")).toBeNull();
    },
  );

  it("carries the Color through the Marking detail rows", () => {
    const record = mapApiMarkingToRecord({
      id: 1, type: "TOWNMARK", color_name: "Red", color_hex: "#C62828",
    });
    const rows = buildMarkingFields({
      ...record, rateValFormatted: "", dimensions: "", earliestSeen: "", latestSeen: "", datesSeen: "",
    }, { isStaff: false }).filter((row) => row.label === "Color");
    render(<MarkingFieldsDisplay rows={rows} mode="record" />);
    expect(screen.getByText("Red").style.color).toBe("rgb(198, 40, 40)");
  });
});
