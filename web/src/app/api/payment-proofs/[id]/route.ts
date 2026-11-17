import { currentActor } from "@/lib/security/session";
import { errorResponse, HttpError } from "@/lib/http";
import { findVisibleProof } from "@/lib/payments/repository";
import { readProof } from "@/lib/payments/proofs";
import { proofDownloadHeaders } from "@/lib/payments/proof-type";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const proof = await findVisibleProof(actor, (await params).id);
    if (!proof) throw new HttpError(404, "Proof not found");
    const bytes = await readProof(proof.storageKey).catch(() => { throw new HttpError(404, "Proof file is unavailable"); });
    return new Response(new Uint8Array(bytes), { headers: proofDownloadHeaders(proof.fileName, proof.mediaType) });
  } catch (error) { return errorResponse(error); }
}
