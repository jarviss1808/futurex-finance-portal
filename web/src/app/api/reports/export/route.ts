import { db } from "@/lib/db";
import { currentUser } from "@/lib/security/session";
import { errorResponse } from "@/lib/http";
import { parseReportFilters } from "@/lib/reports/sales";
import { buildReportTable, exportFileName, resolveView } from "@/lib/reports/views";
import { tableToCsv, tableToPdf, tableToXlsx } from "@/lib/reports/export";

const types = { csv: "text/csv; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" } as const;

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const actor = { id: user.id, organizationId: user.organizationId, role: user.role };
    const url = new URL(request.url);
    const params: Record<string, string[]> = {};
    for (const [key, value] of url.searchParams) (params[key] ??= []).push(value);
    const view = resolveView(actor, url.searchParams.get("view") ?? undefined);
    const format = (["csv", "xlsx", "pdf"] as const).find((item) => item === url.searchParams.get("format")) ?? "xlsx";
    const table = await buildReportTable(actor, view, parseReportFilters(params, actor), user.name);
    const body = format === "csv" ? tableToCsv(table) : format === "xlsx" ? new Uint8Array(await tableToXlsx(table)) : new Uint8Array(await tableToPdf(table));
    await db.auditEvent.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: "REPORT_EXPORTED", entityType: "Report", entityId: view, metadata: { format, rows: table.rows.length, filters: url.searchParams.toString().slice(0, 1000) } } });
    return new Response(body, { headers: { "Content-Type": types[format], "Content-Disposition": `attachment; filename="${exportFileName(table, format)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
