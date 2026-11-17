import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { minorUnitsToDecimal } from "@/lib/finance/money";
import { csvRow } from "./csv";
import { formatIstDate, istDateString } from "./period";
import type { Cell, Column, ReportTable } from "./tables";

const logoPath = () => path.join(process.cwd(), "public", "branding", "futurex-logo.png");

function groupIndian(minor: bigint) {
  const decimal = minorUnitsToDecimal(minor);
  const negative = decimal.startsWith("-");
  const [integer, fraction] = (negative ? decimal.slice(1) : decimal).split(".");
  const grouped = integer.length <= 3 ? integer : `${integer.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${integer.slice(-3)}`;
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

function plainText(column: Column, value: Cell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (column.kind === "money" && typeof value === "bigint") return minorUnitsToDecimal(value);
  if (value instanceof Date) return istDateString(value);
  return String(value);
}

export function tableToCsv(table: ReportTable) {
  const lines = [csvRow([table.title]), csvRow([table.subtitle]), "", csvRow(table.columns.map((column) => column.label))];
  for (const row of [...table.rows, ...table.footer]) lines.push(csvRow(table.columns.map((column) => plainText(column, row[column.key]))));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function tableToXlsx(table: ReportTable) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Futurex Finance Portal";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  sheet.addRow([table.title]).font = { bold: true, size: 14, color: { argb: "FF101E58" } };
  sheet.addRow([table.subtitle]).font = { italic: true, color: { argb: "FF667085" } };
  sheet.addRow([]);
  const header = sheet.addRow(table.columns.map((column) => column.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF101E58" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
  const write = (values: Record<string, Cell>, bold = false) => {
    const row = sheet.addRow(table.columns.map((column) => {
      const value = values[column.key];
      if (value === null || value === undefined) return "";
      if (column.kind === "money" && typeof value === "bigint") return { formula: `${value.toString()}/100`, result: undefined };
      if (column.kind === "date" && value instanceof Date) return new Date(`${istDateString(value)}T00:00:00.000Z`);
      if (typeof value === "bigint") return value.toString();
      return value;
    }));
    if (bold) { row.font = { bold: true }; row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F6" } }; }); }
  };
  for (const row of table.rows) write(row);
  for (const row of table.footer) write(row, true);
  table.columns.forEach((column, index) => {
    const sheetColumn = sheet.getColumn(index + 1);
    sheetColumn.width = Math.max(10, Math.round((column.width ?? 1) * 14));
    if (column.kind === "money") { sheetColumn.numFmt = "#,##0.00"; sheetColumn.alignment = { horizontal: "right" }; }
    if (column.kind === "date") sheetColumn.numFmt = "dd-mmm-yyyy";
  });
  if (table.rows.length) sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: table.columns.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const replacements: Record<string, string> = { "₹": "Rs.", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "-", "×": "x", " ": " " };
/** Standard PDF fonts only cover Latin-1; anything else is replaced rather than crashing the export. */
function pdfSafe(text: string) {
  return [...text].map((character) => replacements[character] ?? (character.charCodeAt(0) <= 0xff && character.charCodeAt(0) >= 0x20 ? character : "?")).join("");
}

function fit(font: PDFFont, text: string, size: number, width: number) {
  let value = pdfSafe(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value}...`;
}

export async function tableToPdf(table: ReportTable) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(table.title));
  pdf.setProducer("Futurex Finance Portal");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(logoPath()));
  const [pageWidth, pageHeight] = [841.89, 595.28];
  const margin = 28, rowHeight = 15, size = 7.2;
  const usable = pageWidth - margin * 2;
  const weights = table.columns.map((column) => column.width ?? 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => (usable * weight) / totalWeight);
  const ink = rgb(0.06, 0.09, 0.16), blue = rgb(0.06, 0.12, 0.35), muted = rgb(0.4, 0.44, 0.52), line = rgb(0.89, 0.91, 0.93);
  const generated = `Generated ${formatIstDate(new Date())} ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date())} IST`;
  const pages: ReturnType<typeof pdf.addPage>[] = [];

  const newPage = () => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    page.drawImage(logo, { x: margin, y: pageHeight - 52, width: 150, height: 33.5 });
    page.drawText(fit(bold, table.title, 13, usable - 330), { x: margin + 170, y: pageHeight - 34, size: 13, font: bold, color: blue });
    page.drawText(fit(regular, table.subtitle, 8, usable - 170), { x: margin + 170, y: pageHeight - 48, size: 8, font: regular, color: muted });
    page.drawText(generated, { x: pageWidth - margin - regular.widthOfTextAtSize(generated, 7), y: pageHeight - 34, size: 7, font: regular, color: muted });
    let y = pageHeight - 76;
    page.drawRectangle({ x: margin, y: y - 4, width: usable, height: 17, color: blue });
    let x = margin;
    table.columns.forEach((column, index) => {
      const label = fit(bold, column.label.toUpperCase(), 6.5, widths[index] - 6);
      const labelX = column.kind === "money" || column.kind === "count" || column.kind === "percent" ? x + widths[index] - 3 - bold.widthOfTextAtSize(label, 6.5) : x + 3;
      page.drawText(label, { x: labelX, y: y + 1, size: 6.5, font: bold, color: rgb(1, 1, 1) });
      x += widths[index];
    });
    y -= rowHeight + 2;
    return { page, y };
  };

  let { page, y } = newPage();
  const drawRow = (values: Record<string, Cell>, strong = false) => {
    if (y < margin + 20) ({ page, y } = newPage());
    if (strong) page.drawRectangle({ x: margin, y: y - 4, width: usable, height: rowHeight, color: rgb(0.93, 0.95, 0.97) });
    let x = margin;
    table.columns.forEach((column, index) => {
      const raw = values[column.key];
      const text = raw === null || raw === undefined ? "" : typeof raw === "string" ? raw : column.kind === "money" && typeof raw === "bigint" ? groupIndian(raw) : raw instanceof Date ? formatIstDate(raw) : String(raw);
      const font = strong ? bold : regular;
      const value = fit(font, text, size, widths[index] - 6);
      const numeric = column.kind === "money" || column.kind === "count" || column.kind === "percent";
      page.drawText(value, { x: numeric ? x + widths[index] - 3 - font.widthOfTextAtSize(value, size) : x + 3, y, size, font, color: ink });
      x += widths[index];
    });
    page.drawLine({ start: { x: margin, y: y - 4.5 }, end: { x: margin + usable, y: y - 4.5 }, thickness: 0.4, color: line });
    y -= rowHeight;
  };
  for (const row of table.rows) drawRow(row);
  if (!table.rows.length) { page.drawText("No records match these filters.", { x: margin + 3, y, size: 8, font: regular, color: muted }); y -= rowHeight; }
  for (const row of table.footer) drawRow(row, true);
  pages.forEach((item, index) => {
    const label = `Page ${index + 1} of ${pages.length}  |  Futurex Trade Fair and Events Pvt. Ltd.  |  Confidential`;
    item.drawText(label, { x: margin, y: 14, size: 6.5, font: regular, color: muted });
  });
  return pdf.save({ useObjectStreams: false });
}
