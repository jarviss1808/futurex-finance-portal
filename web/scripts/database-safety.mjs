function identity(url) {
  return `${url.protocol}//${url.username}@${url.hostname}:${url.port || "5432"}${url.pathname}`;
}

/** @param {string | undefined} raw @param {{ purpose?: string, productionUrl?: string }} [options] */
export function assertDisposableDatabaseUrl(raw, { purpose = "integration", productionUrl } = {}) {
  if (!raw) throw new Error(`${purpose === "restore" ? "RESTORE_DATABASE_URL" : "TEST_DATABASE_URL"} is required`);
  let target;
  try { target = new URL(raw); } catch { throw new Error("Database URL is invalid"); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error("Only PostgreSQL test targets are allowed");
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const requiredSuffix = purpose === "restore" ? "_restore_test" : "_test";
  if (!database.endsWith(requiredSuffix)) throw new Error(`Refusing ${purpose}: database name must end with ${requiredSuffix}`);
  if (["postgres", "template0", "template1"].includes(database)) throw new Error("Refusing a PostgreSQL system database");
  if (productionUrl) {
    let production;
    try { production = new URL(productionUrl); } catch { throw new Error("DATABASE_URL is invalid"); }
    if (identity(target) === identity(production)) throw new Error("Refusing to use DATABASE_URL as a disposable target");
  }
  return { target, database };
}
