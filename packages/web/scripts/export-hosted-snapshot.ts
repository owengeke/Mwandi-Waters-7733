/**
 * READ-ONLY export of hosted Turso database to local SQLite file.
 * NO writes to the hosted database.
 *
 * Usage:
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... SNAPSHOT_PATH=%TEMP%\mwandi-hosted-snapshot.db bun scripts/export-hosted-snapshot.ts
 */
import { createClient } from "@libsql/client";
import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";

const url = process.env.DATABASE_URL?.trim();
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
const outputPath = process.env.SNAPSHOT_PATH?.trim() ?? "mwandi-hosted-snapshot.db";

if (!url || !url.startsWith("libsql://")) {
  console.error("ABORT: Set DATABASE_URL to a libsql:// hosted database URL.");
  process.exit(1);
}
if (!authToken) {
  console.error("ABORT: Set DATABASE_AUTH_TOKEN.");
  process.exit(1);
}

console.log(`=== Exporting hosted DB to local snapshot ===`);
console.log(`Source: ${url}`);
console.log(`Target: ${outputPath}`);

// Clean up any existing output
for (const suffix of ["", "-wal", "-shm"]) {
  if (existsSync(outputPath + suffix)) rmSync(outputPath + suffix, { force: true });
}

// Connect to hosted (read-only intent - we only SELECT)
const hosted = createClient({ url, authToken });

// Create local SQLite database
const local = new Database(outputPath);
local.run("PRAGMA journal_mode = WAL");

// Get all user tables from hosted
const tablesResult = await hosted.execute(`
  SELECT name, sql FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_drizzle%'
  ORDER BY name
`);
const tables = tablesResult.rows as Array<{ name: string; sql: string }>;
console.log(`Found ${tables.length} tables`);

let totalRows = 0;

for (const table of tables) {
  console.log(`  Exporting ${table.name}...`);

  // Create table in local DB
  if (table.sql) {
    local.run(table.sql);
  }

  // Get column info from local DB (after creation) to identify non-generated columns
  const colInfo = local.query(`PRAGMA table_info("${table.name}")`).all() as Array<{ name: string; notnull: number; pk: number; type: string }>;
  // Include all columns except generated ones (pk columns are needed for exact copy)
  const insertableCols = colInfo.filter(c => !c.type.toLowerCase().includes("generated")).map(c => c.name);
  const insertableColsQuoted = insertableCols.map(c => `"${c}"`).join(", ");
  const placeholders = insertableCols.map(() => "?").join(", ");

  // Count rows first
  const countResult = await hosted.execute(`SELECT COUNT(*) as cnt FROM "${table.name}"`);
  const rowCount = Number((countResult.rows[0] as any).cnt);
  totalRows += rowCount;

  if (rowCount === 0) {
    console.log(`    ${rowCount} rows`);
    continue;
  }

  const insertStmt = local.prepare(
    `INSERT INTO "${table.name}" (${insertableColsQuoted}) VALUES (${placeholders})`
  );

  // Fetch all rows in batches
  let offset = 0;
  const batchSize = 500;
  let batchCount = 0;

  while (true) {
    const batchResult = await hosted.execute(
      `SELECT ${insertableColsQuoted} FROM "${table.name}" LIMIT ${batchSize} OFFSET ${offset}`
    );
    const rows = batchResult.rows;
    if (rows.length === 0) break;

    for (const row of rows) {
      const values = insertableCols.map(c => row[c]);
      insertStmt.run(values);
    }

    batchCount += rows.length;
    offset += batchSize;
  }

  console.log(`    ${batchCount} rows`);
}

local.run("PRAGMA wal_checkpoint(TRUNCATE)");

// Validate
const mode = local.query("pragma journal_mode").get() as { journal_mode: string };
const integrity = local.query("pragma integrity_check").get() as { integrity_check: string };
const clients = local.query("select count(*) as n from clients").get() as { n: number };
const invoices = local.query("select count(*) as n from invoices").get() as { n: number };
const payments = local.query("select count(*) as n from payments").get() as { n: number };
const balance = local
  .query("select current_balance_kes from clients where account_number = 'ACC-0001'")
  .get() as { current_balance_kes: number } | null;

local.close();
await hosted.close();

console.log(`\n=== Export complete ===`);
console.log(`Tables: ${tables.length} | Total rows: ${totalRows}`);
console.log(`Mode: ${mode.journal_mode} | integrity: ${integrity.integrity_check}`);
console.log(`Clients: ${clients.n} | Invoices: ${invoices.n} | Payments: ${payments.n}`);
console.log(`Wanjiru balance: ${balance?.current_balance_kes ?? "missing"}`);
console.log(`Snapshot written to: ${outputPath}`);

if (mode.journal_mode !== "wal" || integrity.integrity_check !== "ok") {
  console.error("Snapshot validation failed");
  process.exit(1);
}