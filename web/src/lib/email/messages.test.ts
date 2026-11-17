import { describe, expect, it } from "vitest";
import { buildPaymentConfirmationEmail, buildPaymentReminderEmail } from "./template";
import { normalizeLogin, displayLogin } from "@/lib/security/login-id";
import { detectProofMediaType, safeProofFileName } from "@/lib/payments/proof-type";
import { explainSendgridError } from "./errors";

const sender = { companyName: "Futurex Trade Fair and Events Private Limited", accountsEmail: "accounts@futurextrade.com", bank: { accountName: "Futurex Trade Fair and Events Private Limited", bankName: "Axis Bank Ltd.", branch: "Anna Salai", accountNumber: "911020049540908", ifsc: "UTIB0000168", swift: "AXISINBB168" } };

describe("payment reminder email", () => {
  const email = buildPaymentReminderEmail({ contactName: "Rahul <script>", clientName: "Acme & Sons", piNumber: "FUT/PI/26-27/002", piDate: "2026-11-16", currency: "INR", totalPaise: 9_558_000n, approvedPaise: 2_000_000n, outstandingPaise: 7_558_000n, event: { name: "India Battery Show", edition: "2nd Edition", startsOn: "2027-01-20", endsOn: "2027-01-22", venue: "Pragati Maidan", city: "New Delhi" }, managerName: "Jagriti", message: "Please pay by Friday", sender, asOf: "16 Nov 2026" });
  it("personalises client, PI, balance and bank details", () => {
    expect(email.subject).toBe("Payment reminder – FUT/PI/26-27/002 | India Battery Show | Balance due ₹75,580.00");
    expect(email.text).toContain("Dear Rahul <script>,");
    expect(email.text).toContain("Balance due: ₹75,580.00 (INR)");
    expect(email.text).toContain("Received so far: ₹20,000.00");
    expect(email.text).toContain("IFSC: UTIB0000168");
    expect(email.text).toContain("Please pay by Friday");
    expect(email.text).toContain("Jagriti");
  });
  it("escapes all client-supplied text in HTML", () => {
    expect(email.html).toContain("Rahul &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Acme &amp; Sons");
    expect(email.html).toContain("cid:futurex-logo");
  });
});

describe("payment confirmation email", () => {
  it("states fully paid when nothing is outstanding", () => {
    const email = buildPaymentConfirmationEmail({ clientName: "Acme", piNumber: "PI-1", currency: "INR", amountPaise: 100_00n, tdsPaise: 2_00n, paidOn: "2026-11-16", mode: "NEFT", reference: "UTR9", totalPaise: 100_00n, approvedPaise: 100_00n, outstandingPaise: 0n, sender });
    expect(email.subject).toBe("Payment received – ₹100.00 against PI-1");
    expect(email.text).toContain("Status: Fully paid");
    expect(email.text).not.toContain("Bank details for payment");
    expect(email.text).toContain("TDS deducted (not cash received): ₹2.00");
  });
});

describe("SendGrid error messages", () => {
  it("explains the exhausted-credits failure seen on this account in plain words", () => {
    expect(explainSendgridError(401, '{"errors":[{"message":"Maximum credits exceeded"}]}')).toMatch(/no email credits left/);
    expect(explainSendgridError(401, '{"errors":[{"message":"The provided authorization grant is invalid"}]}')).toMatch(/API key/);
    expect(explainSendgridError(403, "")).toMatch(/sender is verified/);
  });
});

describe("login IDs", () => {
  it("maps short IDs to the login domain and leaves emails alone", () => {
    expect(normalizeLogin(" Jagriti ", "futurex.local")).toBe("jagriti@futurex.local");
    expect(normalizeLogin("Admin@Futurex.Local", "futurex.local")).toBe("admin@futurex.local");
    expect(displayLogin("shiv@futurex.local", "futurex.local")).toBe("shiv");
    expect(displayLogin("someone@gmail.com", "futurex.local")).toBe("someone@gmail.com");
  });
});

describe("payment proof uploads", () => {
  it("identifies files by content, not by name", () => {
    expect(detectProofMediaType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectProofMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectProofMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectProofMediaType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(safeProofFileName("../../evil<>.exe", "image/png")).toBe(".._.._evil_.png");
  });
});
