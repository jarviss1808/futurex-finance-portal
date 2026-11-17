import { currentActor } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";
import { errorResponse } from "@/lib/http";
import { correctPayment } from "@/lib/payments/service";
import { discardProof, storeProof } from "@/lib/payments/proofs";
import { readPaymentRequest } from "@/lib/payments/request";

/** Correct a pending entry or correct-and-resubmit a declined one. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let proof = null;
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { fields, file } = await readPaymentRequest(request);
    proof = await storeProof(actor.organizationId, file);
    return Response.json(await correctPayment(actor, (await params).id, fields, proof));
  } catch (error) {
    await discardProof(proof);
    return errorResponse(error);
  }
}
