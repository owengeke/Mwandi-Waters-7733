/**
 * Build a clean, single-file SQLite snapshot for Turso's "Upload SQLite File"
 * flow. Turso requires WAL journal mode; the local dev database may be in
 * `delete` mode, so copy it with VACUUM INTO and switch the copy to WAL.
 *
 *   bun run db:snapshot   (from packages/web)
 */
import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";

const sourcePath = process.env.LOCAL_DB_PATH ?? "local.db";
const outputPath = process.env.SNAPSHOT_PATH ?? "mwandi-waters-upload.db";

if (!existsSync(sourcePath)) {
  console.error(`Local database not found: ${sourcePath}`);
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  if (existsSync(outputPath + suffix)) rmSync(outputPath + suffix, { force: true });
}

const source = new Database(sourcePath, { readonly: true });
source.run(`VACUUM INTO '${outputPath.replaceAll("'", "''")}'`);
source.close();

const snapshot = new Database(outputPath);
snapshot.run("PRAGMA journal_mode = WAL");
snapshot.run("PRAGMA wal_checkpoint(TRUNCATE)");

const mode = snapshot.query("pragma journal_mode").get() as { journal_mode: string };
const integrity = snapshot.query("pragma integrity_check").get() as { integrity_check: string };
const clients = snapshot.query("select count(*) as n from clients").get() as { n: number };
const sessions = snapshot.query("select count(*) as n from session").get() as { n: number };
const balance = snapshot
  .query("select current_balance_kes from clients where account_number = 'ACC-0001'")
  .get() as { current_balance_kes: number } | null;
snapshot.close();

if (mode.journal_mode !== "wal" || integrity.integrity_check !== "ok") {
  console.error("Snapshot validation failed", { mode, integrity });
  process.exit(1);
}
if (sessions.n !== 0) {
  console.warn(`Warning: snapshot contains ${sessions.n} auth session(s).`);
}

console.log(`Snapshot: ${outputPath}`);
console.log(`Mode: ${mode.journal_mode} | integrity: ${integrity.integrity_check}`);
console.log(`Clients: ${clients.n} | Wanjiru balance: ${balance?.current_balance_kes ?? "missing"}`);
console.log("Upload this file in Turso, then delete it once the database is created.");
