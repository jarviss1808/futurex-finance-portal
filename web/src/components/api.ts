"use client";

/** JSON (or multipart when `body` is FormData) request that throws the server's message on failure. */
export async function api<T = Record<string, unknown>>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(url, { method, headers: isForm ? undefined : { "Content-Type": "application/json" }, body: isForm ? body : JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => ({}));
  // An expired session re-renders through the portal layout, which redirects to the sign-in page.
  if (response.status === 401) { window.location.reload(); throw new Error("Please sign in again"); }
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}
