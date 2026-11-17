import { db } from "@/lib/db";
import { currentActor } from "@/lib/security/session";
import { z } from "zod";

const documentType = z.enum(["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "GST_RECEIPT_VOUCHER"]);

export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rawType = new URL(request.url).searchParams.get("type");
  const parsedType = rawType === null ? null : documentType.safeParse(rawType);
  if (parsedType && !parsedType.success) return Response.json({ error: "Invalid document type" }, { status: 400 });
  const type = parsedType?.data;
  const series = await db.documentSeries.findMany({ where: { organizationId: actor.organizationId, configured: true, ...(type ? { documentType: type } : {}) }, select: { id: true, documentType: true, financialYear: true, prefix: true, suffix: true, padding: true }, orderBy: { createdAt: "desc" } });
  return Response.json(series, { headers: { "Cache-Control": "private, no-store" } });
}
