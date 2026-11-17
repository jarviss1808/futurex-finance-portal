import { findVisiblePrivateFile } from "@/lib/documents/repository";
import { currentActor } from "@/lib/security/session";
import { readPrivateFile } from "@/lib/storage/private-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const file = await findVisiblePrivateFile(actor, id);
  if (!file) return Response.json({ error: "Not found" }, { status: 404 });
  const bytes = await readPrivateFile(file.storageKey).catch(() => null);
  if (!bytes) return Response.json({ error: "File unavailable" }, { status: 404 });
  const filename = `${file.document.type}-${file.document.number ?? file.id}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return new Response(bytes, { headers: { "Content-Type": file.mediaType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
