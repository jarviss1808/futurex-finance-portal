import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("safe CSV output", () => {
  it("quotes commas and double quotes", () => expect(csvRow(["A, B", 'Say "yes"'])).toBe('"A, B","Say ""yes"""'));
  it("neutralizes spreadsheet formulas", () => expect(csvCell("=HYPERLINK(\"bad\")")).toBe('"\'=HYPERLINK(""bad"")"'));
});
