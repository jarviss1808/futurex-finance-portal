import { z } from "zod";
import { issueDocument } from "@/lib/documents/issue";
import { errorResponse } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/request";
import { currentActor } from "@/lib/security/session";
import { sendIssuedDocumentEmail } from "@/lib/email/send-issued-document";

const issueInput = z.object({ seriesId: z.string().cuid().optional(), einvoiceStatus: z.enum(["UNRESOLVED", "NOT_APPLICABLE", "REQUIRED_PENDING", "VERIFIED"]).optional(), irn: z.string().trim().min(1).max(100).optional(), acknowledgementNumber: z.string().trim().min(1).max(100).optional(), signedQrPayload: z.string().trim().min(1).max(10000).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await currentActor();
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await context.params;
    const issued = await issueDocument(actor, id, issueInput.parse(await request.json()));
    if (process.env.SENDGRID_AUTO_SEND !== "true") return Response.json(issued);
    try {
      const email = await sendIssuedDocumentEmail(actor, id);
      return Response.json({ ...issued, email });
    } catch (emailError) {
      return Response.json({ ...issued, email: { status: "FAILED", error: emailError instanceof Error ? emailError.message : "Email delivery failed" } });
    }
  } catch (error) { return errorResponse(error); }
}
