import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "./session";
import type { Actor } from "./policy";

export async function requirePortalIdentity() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const actor: Actor = { id: user.id, organizationId: user.organizationId, role: user.role };
  return { user, actor };
}

export async function requirePortalActor() {
  return (await requirePortalIdentity()).actor;
}

// Drop-in name for portal pages: unlike the API helper, this always redirects when unauthenticated.
export const currentActor = requirePortalActor;
