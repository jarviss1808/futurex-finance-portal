import type { Actor } from "./policy";
import { requireCapability } from "./policy";
export function requireAdmin(actor: Actor | null): asserts actor is Actor { if (!actor) throw new Error("Unauthorized"); requireCapability(actor, "ADMINISTER"); }
