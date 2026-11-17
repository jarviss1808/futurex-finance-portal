import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertDisposableDatabaseUrl } from "./database-safety.mjs";
const url=process.env.TEST_DATABASE_URL;
try { assertDisposableDatabaseUrl(url, { productionUrl: process.env.DATABASE_URL }); }
catch (error) { console.error(error instanceof Error ? error.message : "Unsafe test database target"); process.exit(2); }
const env={...process.env,DATABASE_URL:url,NODE_ENV:"test"};
const commands=[
  [fileURLToPath(new URL("../node_modules/prisma/build/index.js",import.meta.url)),["migrate","deploy"]],
  [fileURLToPath(new URL("../node_modules/vitest/vitest.mjs",import.meta.url)),["run","--config","vitest.integration.config.ts"]],
];
for(const [entry,args] of commands){const result=spawnSync(process.execPath,[entry,...args],{stdio:"inherit",env,shell:false});if(result.error){console.error(result.error);process.exit(1)}if(result.status!==0)process.exit(result.status??1)}
