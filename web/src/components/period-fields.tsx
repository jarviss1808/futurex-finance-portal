"use client";
import { useState } from "react";
import { PERIOD_PRESETS } from "@/lib/reports/period";

export function PeriodFields({ label, preset, from, to }: { label: string; preset: string; from?: string; to?: string }) {
  const [value, setValue] = useState(preset);
  return <>
    <label className="field"><small>{label}</small><select name="period" value={value} onChange={(event) => setValue(event.target.value)}>{PERIOD_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    {value === "custom" && <><label className="field"><small>From</small><input type="date" name="from" defaultValue={from} /></label><label className="field"><small>To</small><input type="date" name="to" defaultValue={to} /></label></>}
  </>;
}
