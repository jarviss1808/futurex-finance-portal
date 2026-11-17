import pg from "pg";
import { assertDisposableDatabaseUrl } from "./database-safety.mjs";

if (process.env.CONFIRM_RESTORE !== "YES") throw new Error("Restore confirmation missing");
const connectionString = process.env.RESTORE_DATABASE_URL;
const { database } = assertDisposableDatabaseUrl(connectionString, { purpose: "restore", productionUrl: process.env.DATABASE_URL });

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
} finally {
  await client.end();
}
console.log(`Prepared empty public schema in ${database}`);
