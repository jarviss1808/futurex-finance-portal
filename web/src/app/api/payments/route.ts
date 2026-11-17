import { currentActor } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";
import { errorResponse } from "@/lib/http";
import { listVisiblePayments } from "@/lib/payments/repository";
import { recordPayment } from "@/lib/payments/service";
import { discardProof, storeProof } from "@/lib/payments/proofs";
import { readPaymentRequest } from "@/lib/payments/request";

function serialize(payment: Awaited<ReturnType<typeof listVisiblePayments>>[number]) {
  return { ...payment, amountPaise: payment.amountPaise.toString(), allocations: payment.allocations.map((a) => ({ ...a, amountPaise: a.amountPaise.toString(), tdsPaise: a.tdsPaise.toString(), document: { ...a.document, totalPaise: a.document.totalPaise.toString() } })) };
}

export async function GET() {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json((await listVisiblePayments(actor, { take: 500 })).map(serialize), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let proof = null;
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { fields, file } = await readPaymentRequest(request);
    proof = await storeProof(actor.organizationId, file);
    const payment = await recordPayment(actor, fields, proof);
    return Response.json({ id: payment.id, status: payment.status, amountPaise: payment.amountPaise.toString() }, { status: 201 });
  } catch (error) {
    await discardProof(proof);
    return errorResponse(error);
  }
}
