import { describe, expect, it } from "vitest";
import { clientDocumentRecipients, parseAdditionalEmails } from "./recipients";

describe("client email recipients", () => {
  it("normalizes, deduplicates and limits a client to three recipients", () => {
    expect(clientDocumentRecipients(" Accounts@Example.com ", ["accounts@example.com", "buyer@example.com", "owner@example.com", "extra@example.com"]))
      .toEqual(["accounts@example.com", "buyer@example.com", "owner@example.com"]);
  });

  it("parses two optional comma or semicolon separated addresses", () => {
    expect(parseAdditionalEmails("buyer@example.com; owner@example.com"))
      .toEqual(["buyer@example.com", "owner@example.com"]);
  });

  it("rejects more than two additional addresses instead of silently dropping one", () => {
    expect(() => parseAdditionalEmails("buyer@example.com; owner@example.com, ignored@example.com")).toThrow(/no more than two/i);
  });
});
