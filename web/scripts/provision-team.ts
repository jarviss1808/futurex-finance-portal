/**
 * Creates or updates staff logins from a JSON list and writes the generated passwords to a private file.
 *
 *   npx tsx scripts/provision-team.ts --team <team.json> --out <credentials.txt>
 *
 * team.json: [{ "name": "Jagriti", "login": "jagriti", "role": "EMPLOYEE", "aliases": ["old@email"] }, ...]
 * Existing users (matched by login or alias) get the new name/role/password and are signed out.
 * Passwords are never printed to the console. The output file must not already exist.
 */
import "dotenv/config";
import { randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/security/password";
import { displayLogin, normalizeLogin } from "../src/lib/security/login-id";

type Member = { name: string; login: string; role: "ADMIN" | "EMPLOYEE"; aliases?: string[] };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name} <path>`);
  return value;
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const pick = (count: number) => Array.from({ length: count }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

const team = JSON.parse(await readFile(argument("--team"), "utf8")) as Member[];
const outPath = argument("--out");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });

try {
  for (const member of team) {
    if (!member.name?.trim() || !member.login?.trim() || !["ADMIN", "EMPLOYEE"].includes(member.role)) throw new Error(`Invalid team entry: ${JSON.stringify(member)}`);
  }
  const organization = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) throw new Error("No organization exists");
  const operator = await db.user.findFirst({ where: { organizationId: organization.id, role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!operator) throw new Error("An active Admin is required to record the audit trail");

  const issued: Array<{ name: string; role: string; login: string; password: string; status: string }> = [];
  for (const member of team) {
    const email = normalizeLogin(member.login);
    const candidates = [email, ...(member.aliases ?? []).map((alias) => normalizeLogin(alias))];
    const existing = await db.user.findFirst({ where: { organizationId: organization.id, email: { in: candidates } } });
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    if (existing) {
      if (existing.email !== email && await db.user.findUnique({ where: { email } })) throw new Error(`${email} is already used by another account`);
      await db.$transaction([
        db.user.update({ where: { id: existing.id }, data: { name: member.name.trim(), email, role: member.role, active: true, passwordHash } }),
        db.session.deleteMany({ where: { userId: existing.id } }),
        db.auditEvent.create({ data: { organizationId: organization.id, actorId: operator.id, action: "USER_PROVISIONED", entityType: "User", entityId: existing.id, metadata: { login: email, role: member.role, previousLogin: existing.email, passwordReset: true } } }),
      ]);
      issued.push({ name: member.name, role: member.role, login: displayLogin(email), password, status: existing.email !== email ? `updated (was ${existing.email})` : "updated, password reset" });
    } else {
      const user = await db.user.create({ data: { organizationId: organization.id, name: member.name.trim(), email, role: member.role, passwordHash } });
      await db.auditEvent.create({ data: { organizationId: organization.id, actorId: operator.id, action: "USER_PROVISIONED", entityType: "User", entityId: user.id, metadata: { login: email, role: member.role } } });
      issued.push({ name: member.name, role: member.role, login: displayLogin(email), password, status: "created" });
    }
  }

  const header = { name: "NAME", role: "ROLE", login: "LOGIN ID", password: "PASSWORD" };
  const width = (key: "name" | "role" | "login" | "password") => Math.max(header[key].length, ...issued.map((row) => row[key].length));
  const line = (row: { name: string; role: string; login: string; password: string }) => `${row.name.padEnd(width("name"))}  ${row.role.padEnd(width("role"))}  ${row.login.padEnd(width("login"))}  ${row.password}`;
  const text = [
    "FUTUREX SALES & COLLECTIONS PORTAL — STAFF LOGINS (CONFIDENTIAL)",
    `Generated: ${new Date().toISOString()}`,
    `Portal: ${process.env.APP_ORIGIN ?? "http://localhost:3000"}/login`,
    "",
    "Sign in with the Login ID (or the full email shown in Administration) and the password below.",
    "Hand each person ONLY their own line, privately. Ask everyone to change it under My account → Change password.",
    "Delete this file after the logins have been shared. Any Admin can reset a forgotten password.",
    "",
    line(header),
    ...issued.filter((row) => row.role === "ADMIN").map(line),
    "",
    ...issued.filter((row) => row.role === "EMPLOYEE").map(line),
    "",
  ].join("\r\n");
  await writeFile(outPath, text, { encoding: "utf8", flag: "wx" });
  for (const row of issued) console.log(`${row.role.padEnd(8)} ${row.login.padEnd(10)} ${row.status}`);
  console.log(`\n${issued.length} logins ready. Passwords written to the private output file only.`);
} finally {
  await db.$disconnect();
}
