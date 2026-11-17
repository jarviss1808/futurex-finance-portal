import { currentActor } from "@/lib/security/session";
import { listVisibleDocuments } from "@/lib/documents/repository";
import { csvRow } from "@/lib/reports/csv";
import { HttpError, errorResponse } from "@/lib/http";

const statuses = ["DRAFT", "VALIDATED", "ISSUED", "REVISED", "VOIDED"] as const;
const types = ["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "GST_RECEIPT_VOUCHER"] as const;
function dateValue(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined; }

export async function GET(request: Request) {
  try {
    const actor = await currentActor(); if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const query = new URL(request.url).searchParams; const employee = query.get("employee") || undefined;
    if (employee && actor.role !== "ADMIN") throw new HttpError(403, "Employee filter is Admin-only");
    const from = dateValue(query.get("from")); const toDate = dateValue(query.get("to")); const to = toDate ? new Date(toDate.getTime() + 86_400_000) : undefined;
    const rows = await listVisibleDocuments(actor, { status: statuses.find((value)=>value===query.get("status")), type: types.find((value)=>value===query.get("type")), ownerId: employee, clientId: query.get("client") || undefined, from, to });
    const csv = [csvRow(["Number","Type","Status","Client","Exhibition","Employee","Created at","Issued at","Currency","Gross minor units","TDS minor units","Net receivable minor units"]), ...rows.map((row)=>csvRow([row.number??"DRAFT",row.type,row.status,row.client.legalName,row.event?.name,row.owner.name,row.createdAt,row.issuedAt,row.currency,row.totalPaise,row.tdsPaise,row.netReceivablePaise]))].join("\r\n");
    return new Response(`\uFEFF${csv}\r\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=Futurex-document-report.csv", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch(error) { return errorResponse(error); }
}
