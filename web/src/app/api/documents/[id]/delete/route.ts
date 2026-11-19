
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/security/session";
import { assertSameOrigin } from "@/lib/security/request";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  { params }: Context
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const user = await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Please log in" },
      { status: 401 }
    );
  }

  if (user.role !== "ADMIN" || !user.active) {
    return NextResponse.json(
      { error: "Only Admin can delete a PI" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    await db.$transaction(async (tx) => {
      const document =
        await tx.financialDocument.findFirst({
          where: {
            id,
            organizationId: user.organizationId,
          },
          select: {
            id: true,
            type: true,
            status: true,
            number: true,
            _count: {
              select: {
                allocations: true,
                shares: true,
                files: true,
                adjustments: true,
                emailDeliveries: true,
              },
            },
            tallyExportItem: {
              select: {
                documentId: true,
              },
            },
            receiptFor: {
              select: {
                id: true,
              },
            },
          },
        });

      if (!document) {
        throw new Error("NOT_FOUND");
      }

      if (
        document.type !== "PROFORMA" ||
        document.status !== "DRAFT"
      ) {
        throw new Error("NOT_DRAFT");
      }

      const linked =
        Object.values(document._count).some(
          (count) => count > 0
        ) ||
        document.tallyExportItem !== null ||
        document.receiptFor !== null;

      if (linked) {
        throw new Error("LINKED_RECORDS");
      }

      const deleted =
        await tx.financialDocument.deleteMany({
          where: {
            id,
            organizationId: user.organizationId,
            type: "PROFORMA",
            status: "DRAFT",
          },
        });

      if (deleted.count !== 1) {
        throw new Error("NOT_DRAFT");
      }

      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "PROFORMA_DRAFT_DELETED",
          entityType: "FinancialDocument",
          entityId: id,
          metadata: {
            number: document.number,
            previousStatus: document.status,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      message: "Draft PI deleted permanently",
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "UNKNOWN";

    if (code === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (code === "NOT_DRAFT") {
      return NextResponse.json(
        {
          error:
            "Only Draft Proforma Invoices can be deleted",
        },
        { status: 409 }
      );
    }

    if (code === "LINKED_RECORDS") {
      return NextResponse.json(
        {
          error:
            "This Draft PI has linked records and cannot be deleted",
        },
        { status: 409 }
      );
    }

    console.error("Draft PI deletion failed", error);

    return NextResponse.json(
      {
        error:
          "Unable to delete this Draft PI. Check linked records.",
      },
      { status: 409 }
    );
  }
}
