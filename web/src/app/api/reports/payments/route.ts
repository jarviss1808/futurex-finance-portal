// Superseded by /api/reports/export?view=payments; kept so existing bookmarks keep working.
export async function GET(request: Request) {
  const source = new URL(request.url);
  const target = new URL("/api/reports/export", source);
  for (const [key, value] of source.searchParams) target.searchParams.append(key === "status" ? "pstatus" : key, value);
  target.searchParams.set("view", "payments");
  if (!target.searchParams.has("format")) target.searchParams.set("format", "csv");
  if (!target.searchParams.has("period")) target.searchParams.set("period", source.searchParams.has("from") || source.searchParams.has("to") ? "custom" : "all");
  return Response.redirect(target, 307);
}
