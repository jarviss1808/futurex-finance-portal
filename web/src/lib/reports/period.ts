// Reporting periods are evaluated on the India calendar (IST, UTC+05:30, no daylight saving).
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;

export const PERIOD_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "this_half", label: "This half-year (Apr–Sep / Oct–Mar)" },
  { value: "last_half", label: "Last half-year" },
  { value: "this_fy", label: "This financial year" },
  { value: "last_fy", label: "Last financial year" },
  { value: "this_year", label: "This calendar year" },
  { value: "last_year", label: "Last calendar year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];
export type Period = { preset: PeriodPreset; from?: Date; to?: Date; label: string; fromDate?: string; toDate?: string };

function istToday(now: Date) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

/** UTC instant of 00:00 IST on the given calendar day (month/day may overflow, like Date.UTC). */
function istMidnight(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
}

/** yyyy-mm-dd of the IST calendar day containing `instant`. */
export function istDateString(instant: Date) {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const displayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const formatIstDate = (instant: Date) => displayFormat.format(instant);

function parseDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const instant = istMidnight(y, m - 1, d);
  return istDateString(instant) === value ? instant : undefined;
}

function range(preset: PeriodPreset, now: Date): [Date, Date] | null {
  const { y, m, d, weekday } = istToday(now);
  const mondayOffset = (weekday + 6) % 7;
  const quarterStart = Math.floor(m / 3) * 3;
  const fyStart = m >= 3 ? y : y - 1;
  const halfStartMonth = m >= 3 && m <= 8 ? 3 : 9;
  const halfStartYear = m < 3 ? y - 1 : y;
  switch (preset) {
    case "today": return [istMidnight(y, m, d), istMidnight(y, m, d + 1)];
    case "yesterday": return [istMidnight(y, m, d - 1), istMidnight(y, m, d)];
    case "this_week": return [istMidnight(y, m, d - mondayOffset), istMidnight(y, m, d - mondayOffset + 7)];
    case "last_week": return [istMidnight(y, m, d - mondayOffset - 7), istMidnight(y, m, d - mondayOffset)];
    case "this_month": return [istMidnight(y, m, 1), istMidnight(y, m + 1, 1)];
    case "last_month": return [istMidnight(y, m - 1, 1), istMidnight(y, m, 1)];
    case "this_quarter": return [istMidnight(y, quarterStart, 1), istMidnight(y, quarterStart + 3, 1)];
    case "last_quarter": return [istMidnight(y, quarterStart - 3, 1), istMidnight(y, quarterStart, 1)];
    case "this_half": return [istMidnight(halfStartYear, halfStartMonth, 1), istMidnight(halfStartYear, halfStartMonth + 6, 1)];
    case "last_half": return [istMidnight(halfStartYear, halfStartMonth - 6, 1), istMidnight(halfStartYear, halfStartMonth, 1)];
    case "this_fy": return [istMidnight(fyStart, 3, 1), istMidnight(fyStart + 1, 3, 1)];
    case "last_fy": return [istMidnight(fyStart - 1, 3, 1), istMidnight(fyStart, 3, 1)];
    case "this_year": return [istMidnight(y, 0, 1), istMidnight(y + 1, 0, 1)];
    case "last_year": return [istMidnight(y - 1, 0, 1), istMidnight(y, 0, 1)];
    default: return null;
  }
}

export function resolvePeriod(preset: string | undefined, customFrom?: string, customTo?: string, now = new Date(), fallback: PeriodPreset = "this_month"): Period {
  const chosen = (PERIOD_PRESETS.find((item) => item.value === preset)?.value ?? fallback) as PeriodPreset;
  const name = PERIOD_PRESETS.find((item) => item.value === chosen)!.label;
  if (chosen === "all") return { preset: "all", label: "All time" };
  if (chosen === "custom") {
    let from = parseDay(customFrom);
    let toStart = parseDay(customTo);
    if (from && toStart && from > toStart) [from, toStart] = [toStart, from];
    if (!from && !toStart) return resolvePeriod(fallback, undefined, undefined, now, fallback);
    const to = toStart ? new Date(toStart.getTime() + DAY_MS) : undefined;
    const label = `${from ? formatIstDate(from) : "Beginning"} – ${toStart ? formatIstDate(toStart) : "today"}`;
    return { preset: "custom", from, to, label, fromDate: from ? istDateString(from) : undefined, toDate: toStart ? istDateString(toStart) : undefined };
  }
  const [from, to] = range(chosen, now)!;
  const lastDay = new Date(to.getTime() - DAY_MS);
  const span = from.getTime() === lastDay.getTime() ? formatIstDate(from) : `${formatIstDate(from)} – ${formatIstDate(lastDay)}`;
  return { preset: chosen, from, to, label: `${name} (${span})`, fromDate: istDateString(from), toDate: istDateString(lastDay) };
}

export function inPeriod(instant: Date | null | undefined, period: Pick<Period, "from" | "to">) {
  if (!instant) return false;
  if (period.from && instant < period.from) return false;
  if (period.to && instant >= period.to) return false;
  return true;
}

/** Indian financial-year label (April–March) such as "26-27". */
export function financialYearLabel(now = new Date()) {
  const { y, m } = istToday(now);
  const start = m >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2026-11" style month key and "Nov 2026" label for grouping by IST month. */
export function istMonth(instant: Date) {
  const key = istDateString(instant).slice(0, 7);
  const label = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(instant);
  return { key, label };
}
