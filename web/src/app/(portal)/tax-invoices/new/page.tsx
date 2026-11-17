import { redirect } from "next/navigation";
import { currentActor } from "@/lib/security/portal";
import { DocumentForm } from "../../documents/new/document-form";
export default async function NewTaxInvoicePage(){const actor=(await currentActor())!;if(!["TAX_INVOICE_ISSUER","ACCOUNTANT","ADMIN"].includes(actor.role))redirect("/dashboard");return <><header className="page-head"><div><p className="eyebrow">STATUTORY DOCUMENT</p><h1>Create Tax Invoice</h1><p>Finalization is blocked until tax approval and e-invoice applicability are resolved.</p></div></header><section className="panel"><DocumentForm documentType="TAX_INVOICE"/></section></>}
