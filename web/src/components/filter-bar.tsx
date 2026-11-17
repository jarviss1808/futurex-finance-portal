import Link from "next/link";
import type { ReportFilters } from "@/lib/reports/sales";
import { PI_CATEGORIES } from "@/lib/documents/pi-category";
import { PeriodFields } from "./period-fields";

type Option = { id: string; name: string };

function MultiSelect({ name, label, options, selected }: { name: string; label: string; options: Option[]; selected: string[] }) {
  const chosen = options.filter((option) => selected.includes(option.id));
  return <details className="multi">
    <summary><small>{label}</small><span>{chosen.length === 0 ? "All" : chosen.length === 1 ? chosen[0].name : `${chosen.length} selected`}</span></summary>
    <div className="multi-menu">{options.map((option) => <label key={option.id}><input type="checkbox" name={name} value={option.id} defaultChecked={selected.includes(option.id)} /> {option.name}</label>)}</div>
  </details>;
}

/** GET filter form shared by Payments, Reports and Reminders; filters live in the URL so views are shareable. */
export function FilterBar({ action, filters, employees, events, showPaymentStatus = false, statusOptions = [], showState = false, showCancelled = false, showPiCategory = false, dateLabel, hidden = {} }: {
  action: string; filters: ReportFilters; employees: Option[]; events: Option[]; showPaymentStatus?: boolean; statusOptions?: Array<{ value: string; label: string }>;
  showState?: boolean; showCancelled?: boolean; showPiCategory?: boolean; dateLabel: string; hidden?: Record<string, string>;
}) {
  return <form className="filter-bar" method="get" action={action}>
    {Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <PeriodFields label={dateLabel} preset={filters.period.preset} from={filters.period.preset === "custom" ? filters.period.fromDate : undefined} to={filters.period.preset === "custom" ? filters.period.toDate : undefined} />
    {employees.length > 0 && <MultiSelect name="employee" label="Employees" options={employees} selected={filters.employeeIds} />}
    <MultiSelect name="event" label="Exhibitions" options={events} selected={filters.eventIds} />
    {showPiCategory && <MultiSelect name="category" label="PI category" options={PI_CATEGORIES.map((item) => ({ id: item.value, name: item.label }))} selected={filters.piCategories} />}
    {showPaymentStatus && <MultiSelect name="pstatus" label="Payment status" options={statusOptions.map((item) => ({ id: item.value, name: item.label }))} selected={filters.paymentStatuses} />}
    {showState && <label className="field"><small>PI payment status</small><select name="state" defaultValue={filters.state}><option value="ALL">All PIs</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partially paid</option><option value="PAID">Fully paid</option></select></label>}
    <label className="field grow"><small>Search</small><input type="search" name="q" defaultValue={filters.search} placeholder="Client, PI number or UTR" /></label>
    {showCancelled && <label className="field check-inline"><input type="checkbox" name="cancelled" value="1" defaultChecked={filters.includeCancelled} /> Include cancelled PIs</label>}
    <div className="filter-actions"><button className="button small">Apply</button><Link className="button small ghost" href={`${action}${hidden.view ? `?view=${hidden.view}` : ""}`}>Reset</Link></div>
  </form>;
}
