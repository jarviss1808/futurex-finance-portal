"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Client = { id: string; legalName: string; defaultCurrency: string };
type Event = { id: string; name: string; edition: string | null; taxConfigApproved: boolean; taxRule: null | { name: string; taxType: string; rateBasisPoints: number } };
type Purpose = "SPACE" | "ADDITIONAL_ITEMS";
type PiCategory = "EXHIBITION_PARTICIPATION" | "BRANDING_FLEX_FRAME" | "EXTRA_REQUIREMENTS" | "STALL_FABRICATION";
type Line = { description: string; classification: string; unit: string; quantity: string; unitPrice: string };
type CustomEvent = { name: string; edition: string; startsOn: string; endsOn: string; venue: string; city: string; stateRegion: string; countryCode: string };
export type DocumentFormInitial = { clientId: string; eventId: string; eventSource?: "LISTED" | "CUSTOM"; customEvent?: CustomEvent; stallNumber?: string; piCategory: PiCategory; purpose: Purpose; lines: Line[]; discount: string; otherCharges: string; tdsAmount: string; notes: string };

const spaceLine = (): Line => ({ description: "", classification: "998596", unit: "SQM", quantity: "1", unitPrice: "" });
const itemLine = (): Line => ({ description: "", classification: "998596", unit: "NOS", quantity: "1", unitPrice: "" });

export function DocumentForm({ documentType = "PROFORMA", correctionId, initial }: { documentType?: "PROFORMA" | "TAX_INVOICE"; correctionId?: string; initial?: DocumentFormInitial }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [eventId, setEventId] = useState(initial?.eventId ?? "");
  const [eventSource, setEventSource] = useState<"LISTED" | "CUSTOM">(initial?.eventSource ?? "LISTED");
  const [purpose, setPurpose] = useState<Purpose>(initial?.purpose ?? "SPACE");
  const [piCategory, setPiCategory] = useState<PiCategory>(initial?.piCategory ?? "EXHIBITION_PARTICIPATION");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? [spaceLine()]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const currency = clients.find((client) => client.id === clientId)?.defaultCurrency ?? "INR";
  const selectedEvent = events.find((event) => event.id === eventId);
  const customAllowed = documentType === "PROFORMA" && ["BRANDING_FLEX_FRAME", "STALL_FABRICATION"].includes(piCategory);
  const customSelected = customAllowed && eventSource === "CUSTOM";

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((response) => response.json()),
      fetch("/api/events").then((response) => response.json()),
    ]).then(([clientRows, eventRows]) => {
      setClients(clientRows);
      setEvents(eventRows);
    });
  }, []);

  function choosePurpose(value: Purpose) {
    setPurpose(value);
    setLines(value === "SPACE" ? [spaceLine()] : [itemLine()]);
  }

  function updateLine(index: number, key: keyof Line, value: string) {
    setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(correctionId ? `/api/documents/${correctionId}/correct` : "/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: documentType, piCategory, purpose, clientId: form.get("clientId"), eventSource: customSelected ? "CUSTOM" : "LISTED", eventId: customSelected ? undefined : eventId, customEvent: customSelected ? { name: form.get("customEventName"), edition: form.get("customEventEdition"), startsOn: form.get("customEventStartsOn"), endsOn: form.get("customEventEndsOn"), venue: form.get("customEventVenue"), city: form.get("customEventCity"), stateRegion: form.get("customEventStateRegion"), countryCode: form.get("customEventCountryCode") } : undefined, stallNumber: form.get("stallNumber"), discount: form.get("discount"), otherCharges: form.get("otherCharges"), tdsAmount: documentType === "PROFORMA" ? form.get("tdsAmount") : "0", notes: form.get("notes"), correctionReason: form.get("correctionReason"), lines }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      router.push(`/documents/${data.id}`);
      router.refresh();
    } else {
      setError(data.error ?? "Unable to create draft");
      setPending(false);
    }
  }

  return <form className="form stack" onSubmit={submit}>
    <div className="form-grid">
      <label>Client<select name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="" disabled>Select client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.legalName} · {client.defaultCurrency}</option>)}</select></label>
      {!customSelected && <label>Exhibition<select name="eventId" required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="" disabled>Select exhibition</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}{event.edition ? ` — ${event.edition}` : ""}{!event.taxConfigApproved ? " (tax configuration pending)" : ""}</option>)}</select></label>}
      <label>Stall number (optional)<input name="stallNumber" maxLength={100} defaultValue={initial?.stallNumber ?? ""} placeholder="Example: A-12" /></label>
    </div>

    {documentType === "PROFORMA" && <label>PI category<select value={piCategory} onChange={(event) => { const category = event.target.value as PiCategory; setPiCategory(category); if (!["BRANDING_FLEX_FRAME", "STALL_FABRICATION"].includes(category)) setEventSource("LISTED"); }}><option value="EXHIBITION_PARTICIPATION">Exhibition Participation</option><option value="BRANDING_FLEX_FRAME">Branding / Flex with Frame</option><option value="EXTRA_REQUIREMENTS">Extra Requirements</option><option value="STALL_FABRICATION">Stall Fabrication</option></select></label>}

    {customAllowed && <fieldset className="purpose-picker"><legend>Exhibition source</legend><label className="purpose-option"><input type="radio" checked={eventSource === "LISTED"} onChange={() => setEventSource("LISTED")} /><strong>Futurex exhibition list</strong><span>Select an exhibition already configured by Admin.</span></label><label className="purpose-option"><input type="radio" checked={eventSource === "CUSTOM"} onChange={() => setEventSource("CUSTOM")} /><strong>Other exhibition</strong><span>Enter the customer&apos;s external exhibition details for this PI.</span></label></fieldset>}

    {customSelected && <div className="form-grid">
      <label>Exhibition name<input name="customEventName" required maxLength={200} defaultValue={initial?.customEvent?.name ?? ""} /></label>
      <label>Edition (optional)<input name="customEventEdition" maxLength={100} defaultValue={initial?.customEvent?.edition ?? ""} /></label>
      <label>Start date<input name="customEventStartsOn" type="date" required defaultValue={initial?.customEvent?.startsOn ?? ""} /></label>
      <label>End date<input name="customEventEndsOn" type="date" required defaultValue={initial?.customEvent?.endsOn ?? ""} /></label>
      <label className="wide">Venue<input name="customEventVenue" required maxLength={300} defaultValue={initial?.customEvent?.venue ?? ""} /></label>
      <label>City<input name="customEventCity" required maxLength={120} defaultValue={initial?.customEvent?.city ?? ""} /></label>
      <label>State / region (optional)<input name="customEventStateRegion" maxLength={120} defaultValue={initial?.customEvent?.stateRegion ?? ""} /></label>
      <label>Country code<input name="customEventCountryCode" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={initial?.customEvent?.countryCode ?? "IN"} placeholder="IN" title="Two-letter ISO country code, for example IN, AE or DE" /></label>
    </div>}

    <fieldset className="purpose-picker">
      <legend>Calculation method</legend>
      <label className="purpose-option"><input type="radio" name="purpose" checked={purpose === "SPACE"} onChange={() => choosePurpose("SPACE")} /><strong>Exhibition space</strong><span>Area in square metres × rate per SQM</span></label>
      <label className="purpose-option"><input type="radio" name="purpose" checked={purpose === "ADDITIONAL_ITEMS"} onChange={() => choosePurpose("ADDITIONAL_ITEMS")} /><strong>Additional furniture or services</strong><span>TV, brochure rack, stand or participation item × per-item rate</span></label>
    </fieldset>

    <div className="line-editor">
      <div className="line-head"><div><h2>{purpose === "SPACE" ? "Space calculation" : "Additional items"}</h2><p>{purpose === "SPACE" ? "Example: 6 SQM × ₹5,000 = ₹30,000 before tax." : "Add each furniture or service item with its own quantity and rate."}</p></div>{purpose === "ADDITIONAL_ITEMS" && <button type="button" className="button secondary small" onClick={() => setLines([...lines, itemLine()])}>Add item</button>}</div>
      {lines.map((item, index) => <div className="line-row" key={index}>
        <label>Description<input value={item.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="Enter the exact description" required /></label>
        <label>HSN/SAC<input value={item.classification} onChange={(event) => updateLine(index, "classification", event.target.value)} required /></label>
        <label>Unit<input value={item.unit} readOnly={purpose === "SPACE"} onChange={(event) => updateLine(index, "unit", event.target.value.toUpperCase())} required /></label>
        <label>{purpose === "SPACE" ? "Area (SQM)" : "Quantity"}<input type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={item.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} title="Enter a positive number with up to two decimals" required /></label>
        <label>Rate per {item.unit || "unit"} ({currency})<input type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={item.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} title="Enter an amount with up to two decimals" required /></label>
        {purpose === "ADDITIONAL_ITEMS" && lines.length > 1 && <button type="button" className="remove" aria-label="Remove item" onClick={() => setLines(lines.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
      </div>)}
    </div>

    <div className="form-grid">
      <label>Discount ({currency})<input name="discount" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={initial?.discount ?? "0"} /></label>
      <label>Other charges ({currency})<input name="otherCharges" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={initial?.otherCharges ?? "0"} /></label>
      {documentType === "PROFORMA" && <label>Manual TDS amount ({currency})<input name="tdsAmount" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={initial?.tdsAmount ?? "0"} title="Enter the exact TDS amount. The portal does not calculate a percentage." /></label>}
      <label className="wide">Document notes<textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} /></label>
      {correctionId && <label className="wide">Correction reason<textarea name="correctionReason" rows={3} minLength={5} maxLength={500} required placeholder="Explain why this one-time correction is required" /></label>}
    </div>
    {!clientId && <div className="notice warning">Select a client first. Currency is fixed from the client country.</div>}
    {!customSelected && selectedEvent && (!selectedEvent.taxConfigApproved || !selectedEvent.taxRule) && <div className="notice warning">Admin must assign and approve this exhibition&apos;s tax treatment before a PI can be created.</div>}
    {!customSelected && selectedEvent?.taxConfigApproved && selectedEvent.taxRule && <div className="notice">Tax configured by Admin: {selectedEvent.taxRule.name} · {selectedEvent.taxRule.taxType} {(selectedEvent.taxRule.rateBasisPoints / 100).toFixed(2)}%</div>}
    {customSelected && <div className="notice">Tax is assigned automatically from the approved country policy: Indian venue GST 18%; venue outside India GST not applicable.</div>}
    {error && <p className="error">{error}</p>}
    <div className="form-actions"><button disabled={pending || !clientId || (!customSelected && (!selectedEvent?.taxConfigApproved || !selectedEvent.taxRule))}>{pending ? "Calculating…" : correctionId ? "Save one-time correction" : "Create draft and preview"}</button></div>
  </form>;
}
