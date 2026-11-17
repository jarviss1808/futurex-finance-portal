import { assertRequestBodySize, assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { errorResponse, HttpError } from "@/lib/http";
import { attachProof } from "@/lib/payments/service";
import { discardProof, storeProof } from "@/lib/payments/proofs";
import { PROOF_MAX_BYTES } from "@/lib/payments/proof-type";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let proof = null;
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    assertRequestBodySize(request, PROOF_MAX_BYTES + 256 * 1024);
    proof = await storeProof(actor.organizationId, (await request.formData()).get("proof"));
    if (!proof) throw new HttpError(400, "Choose a file to upload");
    return Response.json(await attachProof(actor, (await params).id, proof), { status: 201 });
  } catch (error) {
    await discardProof(proof);
    return errorResponse(error);
  }
}
