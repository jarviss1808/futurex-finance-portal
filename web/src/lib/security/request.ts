import { HttpError } from "@/lib/http";

export function assertSameOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== expected) throw new HttpError(403, "Invalid request origin");
}

export function assertRequestBodySize(request: Request, maxBytes: number) {
  const raw = request.headers.get("content-length");
  if (!raw) throw new HttpError(411, "Content-Length is required");
  if (!/^\d+$/.test(raw)) throw new HttpError(400, "Invalid Content-Length");
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length > maxBytes) throw new HttpError(413, "Request body is too large");
}

export function requestClientIp(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return (forwarded || "unknown").slice(0, 128);
}
