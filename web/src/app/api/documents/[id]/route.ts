
import { findVisibleDocument } from "@/lib/documents/repository";
import { currentActor } from "@/lib/security/session";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const actor = await currentActor();

  if (!actor) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  const row = await findVisibleDocument(actor, id);

  if (!row) {
    return Response.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  return Response.json(
    {
      ...row,

      taxablePaise:
        row.taxablePaise.toString(),

      taxPaise:
        row.taxPaise.toString(),

      totalPaise:
        row.totalPaise.toString(),

      tdsPaise:
        row.tdsPaise.toString(),

      netReceivablePaise:
        row.netReceivablePaise.toString(),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
