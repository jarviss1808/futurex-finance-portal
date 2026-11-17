"use client";
import { useState } from "react";
import { isValidGstin, OFFICIAL_GST_SEARCH_URL } from "@/lib/clients/gstin";

export type GstVerificationDefaults = { gstin?: string | null; legalName?: string; tradeName?: string | null; status?: string | null; address?: string; verifiedAt?: string | null; verifiedBy?: string | null };

export function GstinVerification({ defaults = {} }: { defaults?: GstVerificationDefaults }) {
  const [gstin, setGstin] = useState(defaults.gstin ?? "");
  const [confirm, setConfirm] = useState(false);
  const valid = gstin.length === 15 && isValidGstin(gstin);
  return <>
    <label>GSTIN <small>(optional)</small><input name="gstin" maxLength={15} value={gstin} onChange={(event) => { setGstin(event.target.value.toUpperCase()); setConfirm(false); }} aria-invalid={gstin.length > 0 && !valid} /></label>
    <div className="wide notice">
      <strong>Official GST taxpayer verification</strong>
      <p>The Government portal opens in a new tab. Complete its CAPTCHA and search manually; this portal does not scrape or bypass it.</p>
      {valid ? <a className="button small secondary" href={OFFICIAL_GST_SEARCH_URL} target="_blank" rel="noopener noreferrer">Verify GSTIN — Official GST Portal</a> : <button className="button small secondary" type="button" disabled>Enter a valid GSTIN first</button>}
      {gstin && !valid && <p className="error">GSTIN format or checksum is invalid.</p>}
      {defaults.verifiedAt && !confirm && <p className="success">Previously confirmed from the official GST portal{defaults.verifiedBy ? ` by ${defaults.verifiedBy}` : ""} on {defaults.verifiedAt}. Changing GSTIN or address revokes this confirmation.</p>}
    </div>
    {valid && <label className="wide check-inline"><input type="checkbox" name="confirmGstVerification" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I completed the CAPTCHA/search on the official GST portal and confirm the details below match its result.</label>}
    {confirm && <>
      <label>Verified legal name<input name="gstVerifiedLegalName" defaultValue={defaults.legalName ?? ""} required /></label>
      <label>Trade name <small>(optional)</small><input name="gstTradeName" defaultValue={defaults.tradeName ?? ""} /></label>
      <label>Registration status<input name="gstRegistrationStatus" defaultValue={defaults.status ?? "Active"} required /></label>
      <label className="wide">Registered business address<textarea name="gstVerifiedAddress" rows={3} defaultValue={defaults.address ?? ""} required /></label>
    </>}
  </>;
}
