import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/security/password";

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;
const organizationName = process.env.INITIAL_ORGANIZATION_NAME?.trim();
if (!email || !password || !organizationName) throw new Error("Set INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, and INITIAL_ORGANIZATION_NAME");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
try {
  if (await db.user.findUnique({ where: { email } })) throw new Error("User already exists; bootstrap is create-only");
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: organizationName } });
    const user = await tx.user.create({ data: { organizationId: organization.id, email, name: "Admin", passwordHash, role: "ADMIN" } });
    await tx.auditEvent.create({ data: { organizationId: organization.id, actorId: user.id, action: "BOOTSTRAP_ADMIN_CREATED", entityType: "Organization", entityId: organization.id } });
  });
  console.log("Initial administrator created. Clear INITIAL_ADMIN_PASSWORD from the environment now.");
} finally { await db.$disconnect(); }
