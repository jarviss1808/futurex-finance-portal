import { describe, expect, it } from "vitest";
import { buildDocumentEmail } from "./template";
import type { DocumentSnapshot } from "@/lib/documents/generate";

const snapshot = { title: "Proforma Invoice", number: "FUT/PI/26-27/001", issueDate: "2026-11-16", companyName: "Futurex", customerName: "Client", customerAddress: "Delhi", currency: "INR", lines: [], taxablePaise: 8100000n, taxLabel: "IGST 18%", taxPaise: 1458000n, totalPaise: 9558000n, event: { name: "India EV International Show", edition: "9th Edition", venue: "Pune", city: "Pune", countryCode: "IN" } } satisfies DocumentSnapshot;

describe("document email template", () => {
  it("personalizes safely and includes the issued number and total", () => {
    const email = buildDocumentEmail(snapshot, "Rahul <Buyer>");
    expect(email.subject).toContain("FUT/PI/26-27/001");
    expect(email.text).toContain("₹95,580.00 (INR)");
    expect(email.html).toContain("Rahul &lt;Buyer&gt;");
  });
});
