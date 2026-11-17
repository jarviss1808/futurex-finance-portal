import "server-only";
import { db } from "@/lib/db";
import { clientRelationshipScope, type Actor } from "@/lib/security/policy";

export function clientScope(actor: Actor) {
  return clientRelationshipScope(actor);
}

export function listVisibleClients(actor: Actor) {
  return db.client.findMany({ where: clientScope(actor), include: { owner: { select: { name: true } }, gstVerifiedBy: { select: { name: true } } }, orderBy: { legalName: "asc" } });
}

export function findVisibleClient(actor: Actor, id: string) {
  return db.client.findFirst({ where: { id, ...clientScope(actor) } });
}
