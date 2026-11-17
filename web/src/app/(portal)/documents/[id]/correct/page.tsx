import { notFound } from "next/navigation";
import { requirePortalActor } from "@/lib/security/portal";
import { findVisibleDocument } from "@/lib/documents/repository";
import { minorUnitsToDecimal } from "@/lib/finance/money";
import { DocumentForm, type DocumentFormInitial } from "../../new/document-form";

type StoredSnapshot = {
  piCategory?: DocumentFormInitial["piCategory"];
  purpose?: DocumentFormInitial["purpose"];
  lines?: Array<{ description: string; classification: string; unit?: string; quantity: string; unitPricePaise: string }>;
  discountPaise?: string; otherChargesPaise?: string; tdsPaise?: string; notes?: string;
};

export default async function CorrectPiPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePortalActor();
  const document = await findVisibleDocument(actor, (await params).id);
  if (!document || document.type !== "PROFORMA" || document.status !== "ISSUED" || document.correctionVersion !== 0 || (actor.role !== "ADMIN" && document.ownerId !== actor.id)) notFound();
  const blockingPayment = await import("@/lib/db").then(({ db }) => db.paymentAllocation.count({ where: { documentId: document.id, payment: { status: { in: ["PENDING", "VERIFIED"] } } } }));
  const snapshot = (document.correctedSnapshot ?? document.snapshot ?? {}) as StoredSnapshot;
  const initial: DocumentFormInitial = {
    clientId: document.clientId,
    eventId: document.eventId ?? "",
    piCategory: document.piCategory ?? snapshot.piCategory ?? "EXHIBITION_PARTICIPATION",
    purpose: snapshot.purpose ?? "ADDITIONAL_ITEMS",
    lines: (snapshot.lines ?? []).map((line) => ({ description: line.description, classification: line.classification, unit: line.unit ?? "NOS", quantity: line.quantity, unitPrice: minorUnitsToDecimal(BigInt(line.unitPricePaise)) })),
    discount: minorUnitsToDecimal(BigInt(snapshot.discountPaise ?? "0")),
    otherCharges: minorUnitsToDecimal(BigInt(snapshot.otherChargesPaise ?? "0")),
    tdsAmount: minorUnitsToDecimal(document.tdsPaise),
    notes: snapshot.notes ?? "",
  };
  return <><header className="page-head"><div><p className="eyebrow">ONE-TIME PI CORRECTION</p><h1>{document.number}</h1><p>The original issued snapshot remains immutable. Saving creates the only allowed corrected snapshot with the same PI number.</p></div></header>{blockingPayment > 0 ? <div className="notice danger">This PI has a pending or approved payment allocation, so it cannot be corrected.</div> : <section className="panel"><DocumentForm correctionId={document.id} initial={initial} /></section>}</>;
}
