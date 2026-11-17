import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const configured = process.env.UPCOMING_EXHIBITIONS_POSTER_PATH;
  if (!configured) return new Response(null, { status: 404 });
  const resolved = path.resolve(configured);
  if (!/\.jpe?g$/i.test(resolved)) return new Response(null, { status: 415 });
  try {
    return new Response(await readFile(resolved), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
