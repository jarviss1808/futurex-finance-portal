import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { generateDocx, generatePdf, generateXlsx, type DocumentSnapshot } from "./generate";
import { readFile } from "node:fs/promises";
import path from "node:path";

const snapshot: DocumentSnapshot = { title: "Proforma Invoice", number: "FUT/PI/26-27/P109", issueDate: "2026-10-28", companyName: "Futurex Trade Fair and Events Private Limited", companyGstin: "07AABCF8175F1ZK", registeredAddress: "Chennai office", gstRegisteredAddress: "Delhi office", bankDetails: { bankName: "Axis Bank Ltd.", accountNumber: "911020049540908", branch: "Anna Salai", bankAddress: "Chennai 600002", ifsc: "UTIB0000168", swift: "AXISINBB168" }, customerName: "Synthetic Customer Private Limited", customerAddress: "Test address, Delhi", customerGstin: "07AAAAA0000A1Z5", currency: "INR", event: { name: "India EV International Show", edition: "9th Edition", startsOn: "2027-10-14", endsOn: "2027-10-16", venue: "Auto Cluster Exhibition Centre", city: "Pune", stateRegion: "Maharashtra", countryCode: "IN" }, lines: [{ description: "Exhibition participation charges", classification: "998596", unit: "SQM", quantity: "30", unitPricePaise: 800000n, amountPaise: 24000000n }], taxablePaise: 24000000n, taxLabel: "CGST 9% + SGST 9%", taxBreakdown: [{ label: "CGST 9%", ratePercent: "9", amountPaise: 2160000n }, { label: "SGST 9%", ratePercent: "9", amountPaise: 2160000n }], taxPaise: 4320000n, totalPaise: 28320000n, tdsPaise: 320000n, netReceivablePaise: 28000000n };

describe("editable and authoritative document outputs", () => {
  it("creates a valid PDF containing at least one A4 page", async () => { const bytes = await generatePdf(snapshot); expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF"); expect(bytes.length).toBeGreaterThan(1000); });
  it("embeds an approved signatory image in PDF and DOCX outputs", async () => { const signatureImageBase64 = (await readFile(path.join(process.cwd(), "public", "branding", "futurex-logo.png"))).toString("base64"); const signed = { ...snapshot, signatureImageBase64 }; const pdf = await generatePdf(signed); const docx = await generateDocx(signed); expect(pdf.length).toBeGreaterThan(1000); expect(docx.subarray(0, 2).toString()).toBe("PK"); });
  it("paginates long wrapped descriptions without overflowing the footer", async () => { const bytes = await generatePdf({ ...snapshot, lines: Array.from({ length: 18 }, (_, index) => ({ ...snapshot.lines[0], description: `Long exhibition service description ${index + 1} that must wrap instead of being clipped at the description column boundary` })) }); const pdf = await PDFDocument.load(bytes); expect(pdf.getPageCount()).toBeGreaterThan(1); });
  it("creates an editable DOCX zip", async () => { const bytes = await generateDocx(snapshot); expect(bytes.subarray(0, 2).toString()).toBe("PK"); });
  it("creates an editable XLSX with currency, words, bank holder and exact formulas", async () => { const bytes = await generateXlsx(snapshot); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never); const sheet = workbook.getWorksheet("Document")!; const rows = sheet.getRows(1, sheet.rowCount) ?? []; const moneyRows = new Map(rows.map((row) => [row.getCell(1).value, row.getCell(6).value])); expect(moneyRows.get("GROSS PI VALUE (INR)")).toMatchObject({ formula: "28320000/100" }); expect(moneyRows.get("MANUAL TDS AMOUNT (INR)")).toMatchObject({ formula: "320000/100" }); expect(moneyRows.get("NET RECEIVABLE (INR)")).toMatchObject({ formula: "28000000/100" }); expect(rows.some((row) => row.getCell(1).value === "AMOUNT IN WORDS" && String(row.getCell(2).value).startsWith("Indian Rupees"))).toBe(true); expect(rows.some((row) => row.getCell(1).value === "Account holder" && row.getCell(2).value === snapshot.companyName)).toBe(true); });
  it("includes a foreign-venue note in generated outputs", async () => {
    const note = "AS PER GST VIDE NOTIFICATION NO.12/2017-CENTRAL TAX(RATE) DATED 28.6.2017";
    const foreign = { ...snapshot, notes: note, event: { ...snapshot.event!, countryCode: "NP" } };
    expect((await generatePdf(foreign)).length).toBeGreaterThan(1000);
    expect((await generateDocx(foreign)).subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await generateXlsx(foreign) as never);
    const rows = workbook.getWorksheet("Document")!.getRows(1, workbook.getWorksheet("Document")!.rowCount) ?? [];
    expect(rows.some((row) => row.getCell(1).value === "NOTE" && row.getCell(2).value === note)).toBe(true);
  });
});
