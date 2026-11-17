import { DocumentForm } from "./document-form";
export default function NewDocumentPage(){return <><header className="page-head"><div><p className="eyebrow">NEW PROFORMA</p><h1>Create a proforma invoice</h1><p>Amounts are recalculated on the server. Issuance remains blocked until tax and numbering are approved.</p></div></header><section className="panel"><DocumentForm/></section></>}
