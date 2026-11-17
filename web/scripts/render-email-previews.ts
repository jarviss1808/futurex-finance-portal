/**
 * Renders the client email templates with clearly-marked sample data so their design can be reviewed
 * in a browser without sending anything:  npx tsx scripts/render-email-previews.ts <output-folder>
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDocumentEmail, buildPaymentConfirmationEmail, buildPaymentReminderEmail } from "../src/lib/email/template";

const out = process.argv[2];
if (!out) throw new Error("Usage: tsx scripts/render-email-previews.ts <output-folder>");
const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", "branding", "futurex-logo-email.png"))).toString("base64")}`;
const sender = { companyName: "Futurex Trade Fair and Events Private Limited", accountsEmail: "accounts@futurextrade.com", bank: { accountName: "Futurex Trade Fair and Events Private Limited", bankName: "Axis Bank Ltd.", branch: "Anna Salai Branch", accountNumber: "911020049540908", ifsc: "UTIB0000168", swift: "AXISINBB168" } };
const event = { name: "India Battery International Show", edition: "2nd Edition", startsOn: "2027-10-14", endsOn: "2027-10-16", venue: "Sample Venue", city: "New Delhi" };
const sample = { contactName: "Mr. Sharma", clientName: "SAMPLE Exhibitor Pvt Ltd", piNumber: "FUT/PI/26-27/003", currency: "INR", totalPaise: 9_558_000n, event, managerName: "Jagriti", sender };

const previews = {
  "1-payment-reminder": buildPaymentReminderEmail({ ...sample, piDate: "2026-11-16", approvedPaise: 2_000_000n, outstandingPaise: 7_558_000n, message: "Kindly clear the balance before 30 November so that we can confirm your stall location.", asOf: "16 Nov 2026" }),
  "2-payment-received": buildPaymentConfirmationEmail({ ...sample, amountPaise: 2_000_000n, paidOn: "2026-11-16", mode: "NEFT", reference: "AXISN2026111600001", approvedPaise: 2_000_000n, outstandingPaise: 7_558_000n }),
  "3-pi-email": buildDocumentEmail({ title: "Proforma Invoice", number: sample.piNumber, issueDate: "2026-11-16", companyName: sender.companyName, accountsEmail: sender.accountsEmail, bankDetails: { ...sender.bank, branch: sender.bank.branch, bankAddress: "" }, event: { ...event, countryCode: "IN" }, customerName: sample.clientName, customerAddress: "", currency: "INR", lines: [], taxablePaise: 8_100_000n, taxLabel: "IGST 18%", taxPaise: 1_458_000n, totalPaise: 9_558_000n }, sample.contactName, sample.managerName),
};

await mkdir(out, { recursive: true });
for (const [name, email] of Object.entries(previews)) {
  const banner = `<div style="background:#fff7df;border-bottom:1px solid #eaaa08;padding:10px 16px;font:13px Arial;color:#713b12">PREVIEW ONLY — sample data · Subject: <b>${email.subject.replace(/</g, "&lt;")}</b></div>`;
  await writeFile(path.join(out, `${name}.html`), email.html.replace("cid:futurex-logo", logo).replace(/<body([^>]*)>/, `<body$1>${banner}`), "utf8");
  await writeFile(path.join(out, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`, "utf8");
}
console.log(`Wrote ${Object.keys(previews).length} previews to ${out}`);
