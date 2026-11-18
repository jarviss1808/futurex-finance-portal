import { HttpError } from "@/lib/http";

export type EventSnapshot = { name: string; edition: string; startsOn: string; endsOn: string; venue: string; city: string; stateRegion: string; countryCode: string };

export function parseCustomEvent(value: unknown): EventSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(409, "Custom exhibition details are missing");
  const item = value as Record<string, unknown>;
  const text = (key: string) => typeof item[key] === "string" ? item[key].trim() : "";
  const event = { name: text("name"), edition: text("edition"), startsOn: text("startsOn"), endsOn: text("endsOn"), venue: text("venue"), city: text("city"), stateRegion: text("stateRegion"), countryCode: text("countryCode").toUpperCase() };
  if (!event.name || !event.startsOn || !event.endsOn || !event.venue || !event.city || !/^[A-Z]{2}$/.test(event.countryCode)) throw new HttpError(409, "Custom exhibition details are incomplete");
  return event;
}

export function customTaxPolicy(countryCode: string) {
  return countryCode.toUpperCase() === "IN" ? { taxType: "GST", rateBasisPoints: 1800 } : { taxType: "NO_GST", rateBasisPoints: 0 };
}
