import { describe, expect, it } from "vitest";
import { amountInWords, documentMoney } from "./amount-words";

describe("currency-aware PI amount wording", () => {
  it("uses Indian numbering and paise for INR", () => {
    expect(amountInWords(9_558_050n, "INR")).toBe("Indian Rupees Ninety-Five Thousand Five Hundred Eighty and Fifty Paise Only");
    expect(documentMoney(9_558_050n, "INR")).toBe("INR 95,580.50");
  });
  it("uses international numbering and cents for USD", () => {
    expect(amountInWords(123_456_78n, "USD")).toBe("US Dollars One Hundred Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Cents Only");
    expect(documentMoney(123_456_78n, "USD")).toBe("USD 123,456.78");
  });
  it("handles zero and whole amounts without fabricated fractional wording", () => {
    expect(amountInWords(0n, "INR")).toBe("Indian Rupees Zero Only");
    expect(amountInWords(10_000_000n, "INR")).toBe("Indian Rupees One Lakh Only");
  });
});
