import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function errorResponse(error: unknown) {
  // Let Next.js internal control-flow signals (dynamic rendering, redirects) propagate untouched.
  unstable_rethrow(error);
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path?.length ? `${String(issue.path[issue.path.length - 1])}: ` : "";
    return Response.json({ error: issue ? `${field}${issue.message}` : "Invalid input" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "A matching record already exists" }, { status: 409 });
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message === "Unauthorized") return Response.json({ error: "Please sign in again" }, { status: 401 });
  if (error instanceof Error && error.message === "Forbidden") return Response.json({ error: "You do not have permission for this action" }, { status: 403 });
  console.error(error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
