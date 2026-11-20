
import { z } from "zod";
import { sendIssuedDocumentEmail } from "@/lib/email/send-issued-document";
import { errorResponse } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";

const input = z.object({
  resend: z.boolean().optional().default(false),
  cc: z.array(z.string()).max(3).optional().default([]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);

    const actor = await currentActor();

    if (!actor) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const body = input.parse(
      await request.json().catch(() => ({}))
    );

    return Response.json(
      await sendIssuedDocumentEmail(actor, id, {
        allowResend: body.resend,
        cc: body.cc,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
