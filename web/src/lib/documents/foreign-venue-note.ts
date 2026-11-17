export const OUTSIDE_INDIA_PI_NOTE =
  "AS PER GST VIDE NOTIFICATION NO.12/2017-CENTRAL TAX(RATE) DATED 28.6.2017 UNDER HEADING 9985 STATES ‘SERVICES BY ANY ORGANIZER TO ANY PERSON IN RESPECT OF BUSINESS EXHIBITION HELD OUTSIDE INDIA’ THE RATE OF TAX IS NIL.";

export function documentNotes(input: {
  eventCountryCode: string;
  taxable: boolean;
  userNotes?: string | null;
}) {
  const notes = input.userNotes?.trim() ?? "";
  if (input.eventCountryCode.trim().toUpperCase() === "IN" || input.taxable) return notes;
  if (notes.includes(OUTSIDE_INDIA_PI_NOTE)) return notes;
  return notes ? `${notes}\n\n${OUTSIDE_INDIA_PI_NOTE}` : OUTSIDE_INDIA_PI_NOTE;
}
