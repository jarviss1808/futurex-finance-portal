import { generateDocx, generatePdf, generateXlsx } from "@/lib/documents/generate";
import { toOutputSnapshot } from "@/lib/documents/output";
import { findVisibleDocument } from "@/lib/documents/repository";
import { currentActor } from "@/lib/security/session";
import { z } from "zod";
import { effectiveSnapshot } from "@/lib/documents/effective";

const outputFormat = z.enum(["pdf", "docx", "xlsx"]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const document = await findVisibleDocument(actor, id);
  if (!document || document.status !== "ISSUED" || !document.snapshot) return Response.json({ error: "Not found" }, { status: 404 });
  const parsedFormat = outputFormat.safeParse(new URL(request.url).searchParams.get("format") ?? "pdf");
  if (!parsedFormat.success) return Response.json({ error: "Invalid download format" }, { status: 400 });
  const format = parsedFormat.data;
  const requestedVersion = new URL(request.url).searchParams.get("version");
  if (requestedVersion && requestedVersion !== "original") return Response.json({ error: "Invalid document version" }, { status: 400 });
  if (requestedVersion === "original" && actor.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = toOutputSnapshot(requestedVersion === "original" ? document.snapshot : effectiveSnapshot(document));
  const output = format === "docx" ? await generateDocx(snapshot) : format === "xlsx" ? await generateXlsx(snapshot) : await generatePdf(snapshot);
  const mediaType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  const extension = format === "docx" || format === "xlsx" ? format : "pdf";
  const filename = `${document.type}-${document.number}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return new Response(output as BodyInit, { headers: { "Content-Type": mediaType, "Content-Disposition": `attachment; filename="${filename}.${extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
