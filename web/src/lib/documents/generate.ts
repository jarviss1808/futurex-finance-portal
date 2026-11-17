import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { amountInWords, documentMoney } from "@/lib/finance/amount-words";

type BankDetails = { bankName: string; accountNumber: string; branch: string; bankAddress: string; ifsc: string; swift: string };

export type DocumentSnapshot = {
  title: string;
  number: string;
  issueDate: string;
  companyName: string;
  companyGstin?: string;
  companyPan?: string;
  companyCin?: string;
  accountsEmail?: string;
  registeredAddress?: string;
  corporateAddress?: string;
  gstRegisteredAddress?: string;
  bankDetails?: BankDetails;
  signatureImageBase64?: string;
  event?: { name: string; edition: string | null; startsOn?: string; endsOn?: string; venue: string; city: string; stateRegion?: string | null; countryCode: string };
  customerName: string;
  customerAddress: string;
  customerGstin?: string;
  currency: string;
  lines: Array<{ description: string; classification: string; unit: string; quantity: string; unitPricePaise: bigint; amountPaise: bigint }>;
  taxablePaise: bigint;
  taxLabel: string;
  taxBreakdown?: Array<{ label: string; ratePercent: string; amountPaise: bigint }>;
  taxPaise: bigint;
  totalPaise: bigint;
  tdsPaise?: bigint;
  netReceivablePaise?: bigint;
  notes?: string;
};

const amount = (value: bigint, currency: string) => documentMoney(value, currency);
const logoPath = () => path.join(process.cwd(), "public", "branding", "futurex-logo.png");
const displayDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));

function wrap(font: PDFFont, text: string, maxWidth: number, size: number) {
  const words = text.trim().split(/\s+/);
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) row = candidate;
    else { if (row) rows.push(row); row = word; }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

export async function generatePdf(snapshot: DocumentSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(logoPath()));
  const ink = rgb(0.06, 0.09, 0.16);
  const blue = rgb(0.06, 0.12, 0.35);
  const red = rgb(0.93, 0.11, 0.14);
  let page: PDFPage = pdf.addPage([595.28, 841.89]);

  const draw = (text: string, x: number, y: number, size = 9, strong = false, maxWidth = 500) => page.drawText(text, { x, y, size, font: strong ? bold : regular, color: ink, maxWidth });
  const drawWrapped = (text: string, x: number, y: number, maxWidth: number, size = 8, maxRows = 2) => {
    const rows = wrap(regular, text, maxWidth, size).slice(0, maxRows);
    rows.forEach((row, index) => draw(row, x, y - index * (size + 3), size, false, maxWidth));
    return rows.length;
  };
  const frame = (continuation = false) => {
    page.drawRectangle({ x: 34, y: 40, width: 527, height: 760, borderColor: blue, borderWidth: 1 });
    page.drawImage(logo, { x: 45, y: 751, width: 215, height: 48 });
    page.drawText(snapshot.title.toUpperCase(), { x: 350, y: 766, size: 13, font: bold, color: blue, maxWidth: 195 });
    draw(snapshot.companyName, 45, 735, 10, true, 310);
    draw(`No: ${snapshot.number}`, 365, 735, 8, false, 175);
    draw(`Date: ${snapshot.issueDate}`, 365, 720, 8, false, 175);
    const identifiers = [snapshot.companyGstin && `GSTIN ${snapshot.companyGstin}`, snapshot.companyPan && `PAN ${snapshot.companyPan}`, snapshot.companyCin && `CIN ${snapshot.companyCin}`].filter(Boolean).join("  |  ");
    if (identifiers) draw(identifiers, 45, 718, 7.5, false, 500);
    if (snapshot.gstRegisteredAddress) drawWrapped(`GST office: ${snapshot.gstRegisteredAddress}`, 45, 703, 500, 7.5, 2);
    if (snapshot.registeredAddress) drawWrapped(`Registered office: ${snapshot.registeredAddress}`, 45, 680, 500, 7.5, 2);
    if (snapshot.corporateAddress) drawWrapped(`Corporate office: ${snapshot.corporateAddress}`, 45, 659, 500, 7.5, 1);
    page.drawLine({ start: { x: 34, y: 648 }, end: { x: 561, y: 648 }, thickness: 1, color: blue });
    if (continuation) draw("CONTINUED", 45, 635, 8, true);
  };
  const newPage = (continuation = false) => { page = pdf.addPage([595.28, 841.89]); frame(continuation); };
  const tableHeader = (at: number) => {
    page.drawRectangle({ x: 42, y: at - 5, width: 511, height: 18, color: blue });
    const white = rgb(1, 1, 1);
    const head = (text: string, x: number) => page.drawText(text, { x, y: at, size: 7, font: bold, color: white });
    head("DESCRIPTION", 46); head("HSN/SAC", 266); head("QTY", 326); head("UNIT", 363); head(`RATE (${snapshot.currency})`, 405); head(`AMOUNT (${snapshot.currency})`, 474);
    return at - 24;
  };

  frame();
  draw("BILL TO", 45, 632, 7, true); draw(snapshot.customerName, 45, 616, 10, true, 245); drawWrapped(snapshot.customerAddress, 45, 601, 245, 8, 3); if (snapshot.customerGstin) draw(`GSTIN: ${snapshot.customerGstin}`, 45, 566, 8);
  draw("EXHIBITION", 320, 632, 7, true); if (snapshot.event) { const eventRows = drawWrapped(`${snapshot.event.name}${snapshot.event.edition ? ` - ${snapshot.event.edition}` : ""}`, 320, 616, 225, 9, 3); let eventY = 616 - eventRows * 12 - 2; if (snapshot.event.startsOn && snapshot.event.endsOn) { draw(`${displayDate(snapshot.event.startsOn)} - ${displayDate(snapshot.event.endsOn)}`, 320, eventY, 8, false, 225); eventY -= 14; } drawWrapped(`${snapshot.event.venue}, ${snapshot.event.city}${snapshot.event.stateRegion ? `, ${snapshot.event.stateRegion}` : ""}, ${snapshot.event.countryCode}`, 320, eventY, 225, 8, 2); }
  let y = tableHeader(515);
  for (const line of snapshot.lines) {
    const descriptionRows = wrap(regular, line.description, 205, 8);
    const rowHeight = Math.max(23, descriptionRows.length * 11 + 7);
    if (y - rowHeight < 165) { newPage(true); y = tableHeader(615); }
    descriptionRows.forEach((row, index) => draw(row, 46, y - index * 11, 8, false, 205));
    draw(line.classification, 266, y, 8, false, 56); draw(line.quantity, 326, y, 8, false, 34); draw(line.unit, 363, y, 8, false, 38); draw(amount(line.unitPricePaise, snapshot.currency), 405, y, 7, false, 74); draw(amount(line.amountPaise, snapshot.currency), 474, y, 7, false, 76);
    page.drawLine({ start: { x: 42, y: y - rowHeight + 7 }, end: { x: 553, y: y - rowHeight + 7 }, thickness: .5, color: rgb(.83, .85, .89) });
    y -= rowHeight;
  }
  if (y < 285) { newPage(true); y = 610; }
  y -= 12;
  page.drawLine({ start: { x: 315, y: y + 12 }, end: { x: 548, y: y + 12 }, thickness: 1, color: blue });
  draw("Taxable value", 325, y, 9); draw(amount(snapshot.taxablePaise, snapshot.currency), 460, y, 8); y -= 20;
  const taxRows = snapshot.taxBreakdown?.length ? snapshot.taxBreakdown : [{ label: snapshot.taxLabel, ratePercent: "", amountPaise: snapshot.taxPaise }];
  for (const tax of taxRows) { draw(tax.label, 325, y, 9); draw(amount(tax.amountPaise, snapshot.currency), 460, y, 8); y -= 20; }
  y -= 7;
  const tdsPaise = snapshot.tdsPaise ?? 0n;
  const netReceivablePaise = snapshot.netReceivablePaise ?? snapshot.totalPaise - tdsPaise;
  draw("GROSS PI VALUE", 325, y, 9, true); draw(amount(snapshot.totalPaise, snapshot.currency), 460, y, 8, true); y -= 20;
  draw("MANUAL TDS AMOUNT", 325, y, 9); draw(amount(tdsPaise, snapshot.currency), 460, y, 8); y -= 20;
  draw("NET RECEIVABLE", 325, y, 10, true); draw(amount(netReceivablePaise, snapshot.currency), 460, y, 8, true); y -= 26;
  const words = amountInWords(snapshot.totalPaise, snapshot.currency);
  draw("AMOUNT IN WORDS", 45, y, 7.5, true); y -= 12;
  const wordRows = wrap(regular, words, 500, 8).slice(0, 2); wordRows.forEach((row) => { draw(row, 45, y, 8, false, 500); y -= 11; });
  y -= 12;
  if (snapshot.notes) {
    const noteRows = wrap(regular, snapshot.notes.replace(/\s+/g, " "), 500, 7.5);
    const noteHeight = 18 + noteRows.length * 10;
    if (y - noteHeight < 155) { newPage(true); y = 610; }
    draw("NOTE", 45, y, 7.5, true); y -= 13;
    noteRows.forEach((row) => { draw(row, 45, y, 7.5, false, 500); y -= 10; });
    y -= 12;
  }
  if (snapshot.bankDetails?.accountNumber) {
    if (y < 150) { newPage(true); y = 610; }
    draw("BANK DETAILS", 45, y, 8, true); y -= 15;
    draw(`Account holder: ${snapshot.companyName}`, 45, y, 8, true, 500); y -= 13;
    draw(`${snapshot.bankDetails.bankName} | A/C ${snapshot.bankDetails.accountNumber}`, 45, y, 8, true, 500); y -= 13;
    draw(`Branch: ${snapshot.bankDetails.branch} | IFSC: ${snapshot.bankDetails.ifsc} | SWIFT: ${snapshot.bankDetails.swift}`, 45, y, 8, false, 500); y -= 13;
    drawWrapped(snapshot.bankDetails.bankAddress, 45, y, 500, 8, 2);
  }
  if (snapshot.accountsEmail) page.drawText(snapshot.accountsEmail, { x: 45, y: 78, size: 7.5, font: regular, color: red });
  if (snapshot.signatureImageBase64) {
    const signature = await pdf.embedPng(Buffer.from(snapshot.signatureImageBase64, "base64"));
    const scale = Math.min(135 / signature.width, 90 / signature.height);
    page.drawImage(signature, { x: 405, y: 82, width: signature.width * scale, height: signature.height * scale });
    draw("Authorised Signatory", 420, 62, 7.5, true, 125);
  }
  return pdf.save({ useObjectStreams: false });
}

export async function generateDocx(snapshot: DocumentSnapshot): Promise<Buffer> {
  const logo = await readFile(logoPath());
  const rows = snapshot.lines.map((line) => new TableRow({ children: [line.description, line.classification, line.quantity, line.unit, amount(line.unitPricePaise, snapshot.currency), amount(line.amountPaise, snapshot.currency)].map((text) => new TableCell({ children: [new Paragraph(text)] })) }));
  const companyLines = [snapshot.companyGstin && `GSTIN ${snapshot.companyGstin}`, snapshot.companyPan && `PAN ${snapshot.companyPan}`, snapshot.companyCin && `CIN ${snapshot.companyCin}`, snapshot.gstRegisteredAddress && `GST office: ${snapshot.gstRegisteredAddress}`, snapshot.registeredAddress && `Registered office: ${snapshot.registeredAddress}`].filter(Boolean) as string[];
  const bankLines = snapshot.bankDetails?.accountNumber ? [`Account holder: ${snapshot.companyName}`, `${snapshot.bankDetails.bankName} | A/C ${snapshot.bankDetails.accountNumber}`, `Branch ${snapshot.bankDetails.branch} | IFSC ${snapshot.bankDetails.ifsc} | SWIFT ${snapshot.bankDetails.swift}`, snapshot.bankDetails.bankAddress] : [];
  const eventLines = snapshot.event ? [
    new Paragraph({ children: [new TextRun({ text: `Exhibition: ${snapshot.event.name}${snapshot.event.edition ? ` — ${snapshot.event.edition}` : ""}`, bold: true })] }),
    ...(snapshot.event.startsOn && snapshot.event.endsOn ? [new Paragraph(`${displayDate(snapshot.event.startsOn)} - ${displayDate(snapshot.event.endsOn)}`)] : []),
    new Paragraph(`${snapshot.event.venue}, ${snapshot.event.city}${snapshot.event.stateRegion ? `, ${snapshot.event.stateRegion}` : ""}, ${snapshot.event.countryCode}`),
  ] : [];
  const taxLines = snapshot.taxBreakdown?.length
    ? snapshot.taxBreakdown.map((tax) => new Paragraph(`${tax.label}: ${amount(tax.amountPaise, snapshot.currency)}`))
    : [new Paragraph(`${snapshot.taxLabel}: ${amount(snapshot.taxPaise, snapshot.currency)}`)];
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new ImageRun({ type: "png", data: logo, transformation: { width: 280, height: 63 }, altText: { name: "Futurex", description: "Futurex company logo", title: "Futurex" } })] }),
    new Paragraph({ children: [new TextRun({ text: snapshot.title, bold: true, size: 28 })] }),
    new Paragraph(`${snapshot.number} | ${snapshot.issueDate}`),
    new Paragraph({ children: [new TextRun({ text: snapshot.companyName, bold: true })] }),
    ...companyLines.map((line) => new Paragraph(line)),
    new Paragraph({ children: [new TextRun({ text: `Bill to: ${snapshot.customerName}`, bold: true })] }),
    new Paragraph(snapshot.customerAddress),
    ...eventLines,
    new Table({ rows: [new TableRow({ children: ["Description", "HSN/SAC", "Quantity", "Unit", "Rate", "Amount"].map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }), ...rows] }),
    ...taxLines,
    new Paragraph({ children: [new TextRun({ text: `Gross PI value: ${amount(snapshot.totalPaise, snapshot.currency)}`, bold: true })] }),
    new Paragraph(`Manual TDS amount: ${amount(snapshot.tdsPaise ?? 0n, snapshot.currency)}`),
    new Paragraph({ children: [new TextRun({ text: `Net receivable: ${amount(snapshot.netReceivablePaise ?? snapshot.totalPaise - (snapshot.tdsPaise ?? 0n), snapshot.currency)}`, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `Amount in words: ${amountInWords(snapshot.totalPaise, snapshot.currency)}`, bold: true })] }),
    ...(snapshot.notes ? [new Paragraph({ children: [new TextRun({ text: "Note", bold: true })] }), ...snapshot.notes.split(/\n+/).filter(Boolean).map((line) => new Paragraph(line))] : []),
    ...(bankLines.length ? [new Paragraph({ children: [new TextRun({ text: "Bank details", bold: true })] }), ...bankLines.map((line) => new Paragraph(line))] : []),
    ...(snapshot.signatureImageBase64 ? [new Paragraph({ alignment: "right", children: [new ImageRun({ type: "png", data: Buffer.from(snapshot.signatureImageBase64, "base64"), transformation: { width: 120, height: 84 }, altText: { name: "Authorised signatory", description: "Approved Futurex authorised signature and stamp", title: "Authorised Signatory" } })] }), new Paragraph({ alignment: "right", children: [new TextRun({ text: "Authorised Signatory", bold: true })] })] : []),
  ] }] });
  return Packer.toBuffer(doc);
}

export async function generateXlsx(snapshot: DocumentSnapshot): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Futurex Finance Portal";
  const sheet = workbook.addWorksheet("Document", { views: [{ state: "frozen", ySplit: snapshot.event ? (snapshot.event.startsOn && snapshot.event.endsOn ? 12 : 11) : 9 }] });
  const logoId = workbook.addImage({ filename: logoPath(), extension: "png" });
  sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 280, height: 63 } });
  sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
  sheet.addRow([snapshot.companyName]); sheet.addRow([snapshot.companyGstin ? `GSTIN ${snapshot.companyGstin}` : ""]); sheet.addRow([snapshot.title, snapshot.number, snapshot.issueDate]); sheet.addRow([snapshot.customerName]); sheet.addRow([snapshot.customerAddress]);
  if (snapshot.event) { sheet.addRow([`${snapshot.event.name}${snapshot.event.edition ? ` — ${snapshot.event.edition}` : ""}`]); if (snapshot.event.startsOn && snapshot.event.endsOn) sheet.addRow([`${displayDate(snapshot.event.startsOn)} - ${displayDate(snapshot.event.endsOn)}`]); sheet.addRow([`${snapshot.event.venue}, ${snapshot.event.city}${snapshot.event.stateRegion ? `, ${snapshot.event.stateRegion}` : ""}, ${snapshot.event.countryCode}`]); }
  sheet.addRow(["Description", "HSN/SAC", "Quantity", "Unit", `Rate (${snapshot.currency})`, `Amount (${snapshot.currency})`]);
  for (const line of snapshot.lines) sheet.addRow([line.description, line.classification, line.quantity, line.unit, { formula: `${line.unitPricePaise}/100` }, { formula: `${line.amountPaise}/100` }]);
  if (snapshot.taxBreakdown?.length) for (const tax of snapshot.taxBreakdown) sheet.addRow([tax.label, "", "", "", "", { formula: `${tax.amountPaise}/100` }]);
  else sheet.addRow([snapshot.taxLabel, "", "", "", "", { formula: `${snapshot.taxPaise}/100` }]);
  sheet.addRow([`GROSS PI VALUE (${snapshot.currency})`, "", "", "", "", { formula: `${snapshot.totalPaise}/100` }]);
  sheet.addRow([`MANUAL TDS AMOUNT (${snapshot.currency})`, "", "", "", "", { formula: `${snapshot.tdsPaise ?? 0n}/100` }]);
  sheet.addRow([`NET RECEIVABLE (${snapshot.currency})`, "", "", "", "", { formula: `${snapshot.netReceivablePaise ?? snapshot.totalPaise - (snapshot.tdsPaise ?? 0n)}/100` }]);
  sheet.addRow(["AMOUNT IN WORDS", amountInWords(snapshot.totalPaise, snapshot.currency)]);
  if (snapshot.bankDetails?.accountNumber) {
    sheet.addRow(["BANK DETAILS"]);
    sheet.addRow(["Account holder", snapshot.companyName]);
    sheet.addRow(["Bank", snapshot.bankDetails.bankName, "Account number", snapshot.bankDetails.accountNumber]);
    sheet.addRow(["Branch", snapshot.bankDetails.branch, "IFSC", snapshot.bankDetails.ifsc, "SWIFT", snapshot.bankDetails.swift]);
    sheet.addRow(["Bank address", snapshot.bankDetails.bankAddress]);
  }
  if (snapshot.notes) sheet.addRow(["NOTE", snapshot.notes]);
  sheet.getColumn(1).width = 42; sheet.getColumn(2).width = 14; sheet.getColumn(3).width = 11; sheet.getColumn(4).width = 10; sheet.getColumn(5).width = 16; sheet.getColumn(6).width = 18; sheet.getColumn(5).numFmt = '#,##0.00'; sheet.getColumn(6).numFmt = '#,##0.00'; sheet.getRow(snapshot.event ? (snapshot.event.startsOn && snapshot.event.endsOn ? 12 : 11) : 9).font = { bold: true }; sheet.getRow(sheet.rowCount).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
