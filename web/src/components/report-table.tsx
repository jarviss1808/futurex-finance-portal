import { formatCurrencyMinor } from "@/lib/finance/money";
import { formatIstDate } from "@/lib/reports/period";
import type { Cell, Column, ReportTable } from "@/lib/reports/tables";

function render(column: Column, value: Cell, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (column.kind === "money" && typeof value === "bigint") return formatCurrencyMinor(value, currency);
  if (value instanceof Date) return formatIstDate(value);
  return String(value);
}

/** Renders any report table; `barKey` adds a proportional bar so rankings are visible at a glance. */
export function ReportTableView({ table, barKey, linkKey }: { table: ReportTable; barKey?: string; linkKey?: { column: string; href: (row: Record<string, Cell>) => string | null } }) {
  const max = barKey ? table.rows.reduce((top, row) => (row.currency === "INR" && typeof row[barKey] === "bigint" && (row[barKey] as bigint) > top ? (row[barKey] as bigint) : top), 0n) : 0n;
  const numeric = (column: Column) => column.kind === "money" || column.kind === "count" || column.kind === "percent";
  return <div className="table-wrap report-table"><table>
    <thead><tr>{table.columns.filter((column) => column.key !== "currency").map((column) => <th key={column.key} className={numeric(column) ? "num" : undefined}>{column.label}</th>)}</tr></thead>
    <tbody>
      {table.rows.map((row, index) => <tr key={index}>{table.columns.filter((column) => column.key !== "currency").map((column, columnIndex) => {
        const text = render(column, row[column.key], String(row.currency ?? "INR"));
        const href = linkKey && linkKey.column === column.key ? linkKey.href(row) : null;
        const bar = barKey && columnIndex === 0 && max > 0n && typeof row[barKey] === "bigint" && row.currency === "INR" ? Number(((row[barKey] as bigint) * 1000n) / max) / 10 : null;
        return <td key={column.key} className={numeric(column) ? "num" : undefined}>{href ? <a href={href}>{text}</a> : text}{bar !== null && <span className="rank-bar" aria-hidden><i style={{ width: `${Math.max(bar, 1.5)}%` }} /></span>}</td>;
      })}</tr>)}
      {!table.rows.length && <tr><td colSpan={table.columns.length} className="empty">No records match these filters.</td></tr>}
    </tbody>
    {table.footer.length > 0 && table.rows.length > 0 && <tfoot>{table.footer.map((row, index) => <tr key={index}>{table.columns.filter((column) => column.key !== "currency").map((column) => <td key={column.key} className={numeric(column) ? "num" : undefined}>{render(column, row[column.key], String(row.currency ?? "INR"))}</td>)}</tr>)}</tfoot>}
  </table></div>;
}
