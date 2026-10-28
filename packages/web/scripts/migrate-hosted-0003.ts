/**
 * Migration 0003 for hosted Turso database (libSQL).
 * Applies the invoices table rebuild with rate_per_unit_kes, issued_by, issued_at columns.
 *
 * SAFETY REQUIREMENTS:
 * - CONFIRM_HOSTED_MIGRATION=yes must be set
 * - Never uses a transaction or batch: every statement is its own execute() call
 * - Creates payments_link_backup before migration, repairs links if needed, drops at end
 * - PRAGMA foreign_keys=OFF only works per-statement outside a transaction
 *
 * Usage:
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... CONFIRM_HOSTED_MIGRATION=yes bun run db:migrate-hosted-0003
 *
 * Workflow (see docs/hosted-migration.md):
 *   1. turso db copy mwandi-waters mwandi-waters-migration-test
 *   2. Run this script against the copy (verify PASS)
 *   3. Run this script against the real database
 */

import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL?.trim();
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
const confirm = process.env.CONFIRM_HOSTED_MIGRATION?.trim();
const simulateFkOn = process.env.SIMULATE_FK_ON?.trim() === "true";

if (!confirm || confirm !== "yes") {
  console.error("ABORT: Set CONFIRM_HOSTED_MIGRATION=yes to proceed.");
  process.exit(1);
}
if (!url) {
  console.error("ABORT: Set DATABASE_URL (libsql://...).");
  process.exit(1);
}
if (!authToken) {
  console.error("ABORT: Set DATABASE_AUTH_TOKEN.");
  process.exit(1);
}
if (url.startsWith("file:")) {
  const allowLocal = process.env.ALLOW_LOCAL_FILE?.trim();
  if (allowLocal !== "true") {
    console.error("ABORT: file: URLs require ALLOW_LOCAL_FILE=true to be set explicitly.");
    process.exit(1);
  }
  if (simulateFkOn) {
    console.warn("  SIMULATE_FK_ON=true: Will re-enable FK before DROP TABLE to test repair path.");
  }
  console.warn("WARNING: Using local file: database for testing. This is NOT for production use.");
} else {
  // libsql:// URLs must not use SIMULATE_FK_ON
  if (simulateFkOn) {
    console.error("ABORT: SIMULATE_FK_ON is only allowed for file: URLs (local testing).");
    process.exit(1);
  }
}

// Extract host for display
const hostMatch = url.match(/libsql:\/\/([^/]+)/);
const hostDisplay = hostMatch ? hostMatch[1] : url;
console.log(`=== Migrating host: ${hostDisplay} ===`);
console.log("");

const client = createClient({ url, authToken });

// Helper to run a single statement and log
async function exec(sql: string, label: string) {
  console.log(`  → ${label}`);
  try {
    const result = await client.execute(sql);
    console.log(`    OK (${result.rowsAffected ?? 0} rows affected)`);
    return result;
  } catch (e: any) {
    console.error(`    FAILED: ${e.message}`);
    throw e;
  }
}

// Helper for scalar queries
async function scalar(sql: string): Promise<number> {
  const result = await client.execute(sql);
  return Number(Object.values(result.rows[0] ?? {})[0] ?? 0);
}

// Helper for row queries
async function rows(sql: string) {
  const result = await client.execute(sql);
  return result.rows;
}

// ============================================================
// STEP 1: Baseline counts and duplicate check
// ============================================================
console.log("=== STEP 1: Baseline counts & duplicate check ===");

const invCount = await scalar("SELECT COUNT(*) FROM invoices");
const payCount = await scalar("SELECT COUNT(*) FROM payments");
console.log(`  invoices: ${invCount}`);
console.log(`  payments: ${payCount}`);

const duplicates = await rows(`
  SELECT client_id, billing_period_start, COUNT(*) AS cnt
  FROM invoices
  GROUP BY client_id, billing_period_start
  HAVING COUNT(*) > 1
`);
if (duplicates.length > 0) {
  console.error("ABORT: Duplicate (client_id, billing_period_start) found:");
  console.error(JSON.stringify(duplicates, null, 2));
  process.exit(1);
}
console.log("  Duplicate check: PASS (0 duplicates)");

const newInvoicesExists = await rows("SELECT name FROM sqlite_master WHERE type='table' AND name='__new_invoices'");
if (newInvoicesExists.length > 0) {
  console.error("ABORT: __new_invoices table already exists (incomplete previous migration?).");
  process.exit(1);
}
console.log("  __new_invoices check: PASS (not present)");
console.log("");

// ============================================================
// STEP 2: Create payments_link_backup
// ============================================================
console.log("=== STEP 2: Create payments_link_backup ===");
await exec("CREATE TABLE payments_link_backup AS SELECT id, invoice_id FROM payments", "Create payments_link_backup");
const backupCount = await scalar("SELECT COUNT(*) FROM payments_link_backup");
console.log(`  Backup rows: ${backupCount}`);
console.log("");

// ============================================================
// STEP 3: PRAGMA foreign_keys=OFF and verify
// ============================================================
console.log("=== STEP 3: PRAGMA foreign_keys=OFF ===");
await exec("PRAGMA foreign_keys=OFF", "Disable FK checks");
const fkAfterOff = await scalar("PRAGMA foreign_keys");
console.log(`  PRAGMA foreign_keys value: ${fkAfterOff}`);
if (fkAfterOff !== 0) {
  console.error("ABORT: PRAGMA foreign_keys did not return 0 after OFF");
  process.exit(1);
}
console.log("  FK checks disabled: PASS");
console.log("");

// ============================================================
// STEP 4: Run 0003 statements one at a time
// ============================================================
console.log("=== STEP 4: Apply 0003 statements ===");

// Resolve migration file relative to this script's location
// scriptDir = packages/web/scripts/ -> need packages/web/drizzle/
const scriptDir = new URL(".", import.meta.url).pathname;
// Decode URL-encoded path (handles spaces like Default%20Project)
const decodedScriptDir = decodeURIComponent(scriptDir);
// Remove leading slash on Windows
const normalizedScriptDir = decodedScriptDir.startsWith("/") ? decodedScriptDir.slice(1) : decodedScriptDir;
const webDir = join(normalizedScriptDir, "..");
const migrationPath = join(webDir, "drizzle", "0003_friendly_norrin_radd.sql");

if (!existsSync(migrationPath)) {
  console.error(`ABORT: Migration file not found at ${migrationPath}`);
  process.exit(1);
}
console.log(`  Using migration file: ${migrationPath}`);

const sql = readFileSync(migrationPath, "utf8");
// Remove leading comment block (/* ... */) if present
const sqlWithoutComments = sql.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
// Split by --> statement-breakpoint, trim, filter empty
const statements = sqlWithoutComments
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  // Keep only statements that look like SQL (start with known keywords)
  .filter((s) => /^(PRAGMA|CREATE|INSERT|DROP|ALTER)\b/i.test(s));

console.log(`  Found ${statements.length} statements to execute:`);
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  console.log(`    ${i + 1}: ${stmt.slice(0, 60)}...`);
  
  // SIMULATE_FK_ON: before statement 4 (DROP TABLE invoices), re-enable FK to test repair path
  if (simulateFkOn && i === 3 && /^DROP TABLE\s+`invoices`/i.test(stmt)) {
    console.log("  → [SIMULATE_FK_ON] Re-enabling FK before DROP TABLE to test repair path");
    await exec("PRAGMA foreign_keys=ON", "SIMULATE_FK_ON: Enable FK before DROP");
    const fkVal = await scalar("PRAGMA foreign_keys");
    console.log(`  PRAGMA foreign_keys value: ${fkVal}`);
  }
  
  // Execute the statement
  const label = stmt.slice(0, 80).replace(/\s+/g, " ");
  await exec(stmt, `Statement ${i + 1}/${statements.length}: ${label}`);
}
console.log("  All statements applied");
console.log("");

// ============================================================
// STEP 5: Verify migration
// ============================================================
console.log("=== STEP 5: Verify migration ===");

const invCountAfter = await scalar("SELECT COUNT(*) FROM invoices");
const payCountAfter = await scalar("SELECT COUNT(*) FROM payments");
console.log(`  invoices after: ${invCountAfter} (was ${invCount})`);
console.log(`  payments after: ${payCountAfter} (was ${payCount})`);

// FK check
const fkCheck = await rows("PRAGMA foreign_key_check");
console.log(`  PRAGMA foreign_key_check: ${fkCheck.length} violations`);
if (fkCheck.length > 0) {
  console.error("  Foreign key violations:", JSON.stringify(fkCheck));
}

// Payment link integrity
const linkMismatches = await rows(`
  SELECT COUNT(*) AS n
  FROM payments p
  JOIN payments_link_backup b ON b.id = p.id
  WHERE p.invoice_id IS NOT b.invoice_id
`);
const mismatchCount = Number(linkMismatches[0]?.n ?? 0);
console.log(`  Payment link mismatches: ${mismatchCount}`);

if (mismatchCount > 0) {
  console.log("  → Running repair UPDATE...");
  await exec(
    "UPDATE payments SET invoice_id = (SELECT b.invoice_id FROM payments_link_backup b WHERE b.id = payments.id) WHERE invoice_id IS NULL",
    "Repair NULL invoice_id from backup"
  );
  const recheck = await rows(`
    SELECT COUNT(*) AS n
    FROM payments p
    JOIN payments_link_backup b ON b.id = p.id
    WHERE p.invoice_id IS NOT b.invoice_id
  `);
  const recheckCount = Number(recheck[0]?.n ?? 0);
  console.log(`  Mismatches after repair: ${recheckCount}`);
  if (recheckCount > 0) {
    console.error("ABORT: Repair failed to restore all links");
    process.exit(1);
  }
  console.log("  Repair: PASS");
}

// Amount correctness: amount_due_kes = units * 150 for all invoices
const badAmounts = await rows(`
  SELECT COUNT(*) AS n
  FROM invoices
  WHERE ABS(CAST(amount_due_kes AS REAL) - CAST(consumption_units AS REAL) * 150) > 0.005
`);
const badAmountCount = Number(badAmounts[0]?.n ?? 0);
console.log(`  amount_due_kes != units x 150: ${badAmountCount}`);
if (badAmountCount > 0) {
  console.error("ABORT: Some invoices have incorrect amount_due_kes");
  process.exit(1);
}

// Unique index check
const indexes = await rows("PRAGMA index_list(invoices)");
console.log(`  All indexes on invoices: ${indexes.map((r: any) => r.name).join(", ")}`);
const uniqueIdx = indexes.find((r: any) => r.name === "invoices_client_period_idx");
console.log(`  invoices_client_period_idx exists: ${!!uniqueIdx} (unique: ${uniqueIdx?.unique ?? "N/A"})`);
if (!uniqueIdx || uniqueIdx.unique !== 1) {
  console.error("ABORT: Unique index invoices_client_period_idx missing or not unique");
  process.exit(1);
}

// __new_invoices leftover check
const leftover = await rows("SELECT name FROM sqlite_master WHERE type='table' AND name='__new_invoices'");
console.log(`  __new_invoices leftover: ${leftover.length > 0 ? "YES (BAD)" : "NO"}`);
if (leftover.length > 0) {
  console.error("ABORT: __new_invoices table still exists");
  process.exit(1);
}

console.log("  Verification: PASS");
console.log("");

// ============================================================
// STEP 6: Backfill rate_per_unit_kes = 150
// ============================================================
console.log("=== STEP 6: Backfill rate_per_unit_kes = 150 ===");

// First verify all NULL-rate invoices have correct amounts
const nullRateCount = await scalar("SELECT COUNT(*) FROM invoices WHERE rate_per_unit_kes IS NULL");
console.log(`  Invoices with NULL rate_per_unit_kes: ${nullRateCount}`);

if (nullRateCount > 0) {
  // Verify they all have amount_due_kes = units * 150
  const nullRateBad = await rows(`
    SELECT COUNT(*) AS n
    FROM invoices
    WHERE rate_per_unit_kes IS NULL
      AND ABS(CAST(amount_due_kes AS REAL) - CAST(consumption_units AS REAL) * 150) > 0.005
  `);
  const nullRateBadCount = Number(nullRateBad[0]?.n ?? 0);
  console.log(`  NULL-rate invoices with incorrect amounts: ${nullRateBadCount}`);
  
  if (nullRateBadCount > 0) {
    // List them
    const mismatches = await rows(`
      SELECT id, invoice_number, consumption_units, amount_due_kes
      FROM invoices
      WHERE rate_per_unit_kes IS NULL
        AND ABS(CAST(amount_due_kes AS REAL) - CAST(consumption_units AS REAL) * 150) > 0.005
    `);
    console.error("  Mismatched invoices:");
    console.error(JSON.stringify(mismatches, null, 2));
    console.error("ABORT: Some NULL-rate invoices have amounts != units * 150. Fix manually before backfill.");
    process.exit(1);
  }

  // Safe to backfill
  await exec("UPDATE invoices SET rate_per_unit_kes = 150 WHERE rate_per_unit_kes IS NULL", "Backfill rate_per_unit_kes = 150");
  
  const afterBackfill = await scalar("SELECT COUNT(*) FROM invoices WHERE rate_per_unit_kes IS NULL");
  console.log(`  NULL rates after backfill: ${afterBackfill}`);
} else {
  console.log("  No NULL rates to backfill");
}
console.log("  Backfill: PASS");
console.log("");

// ============================================================
// STEP 7: Drop backup and final summary
// ============================================================
console.log("=== STEP 7: Cleanup ===");
await exec("DROP TABLE payments_link_backup", "Drop payments_link_backup");
console.log("  Backup dropped");

const finalInv = await scalar("SELECT COUNT(*) FROM invoices");
const finalPay = await scalar("SELECT COUNT(*) FROM payments");
const finalFk = await rows("PRAGMA foreign_key_check");
const finalNullRates = await scalar("SELECT COUNT(*) FROM invoices WHERE rate_per_unit_kes IS NULL");

// ============================================================
// STEP 8: INV-00002 info (informational, does not fail)
// ============================================================
console.log("=== STEP 8: INV-00002 info ===");
const inv00002 = await rows(`
  SELECT i.invoice_number, i.consumption_units, i.amount_due_kes, i.amount_paid_kes,
         (i.amount_due_kes - i.amount_paid_kes) AS outstanding, i.status
  FROM invoices i
  JOIN clients cl ON cl.id = i.client_id
  WHERE i.invoice_number = 'INV-00002'
`);
if (inv00002.length > 0) {
  const r = inv00002[0] as any;
  console.log(`  INV-00002: units=${r.consumption_units}, due=${r.amount_due_kes}, paid=${r.amount_paid_kes}, outstanding=${r.outstanding}, status=${r.status}`);
} else {
  console.log("  INV-00002: not found in this database (info only, not an error)");
}

console.log("");
console.log("=== MIGRATION SUMMARY ===");
console.log(`  Host: ${hostDisplay}`);
console.log(`  Invoices: ${finalInv}`);
console.log(`  Payments: ${finalPay}`);
console.log(`  FK violations: ${finalFk.length}`);
console.log(`  NULL rate_per_unit_kes: ${finalNullRates}`);
console.log(`  Unique index present: ${uniqueIdx ? "yes" : "no"}`);
if (simulateFkOn) {
  console.log(`  SIMULATE_FK_ON was active: repair path tested`);
}

if (finalFk.length === 0 && finalNullRates === 0 && uniqueIdx?.unique === 1) {
  console.log("");
  console.log("RESULT: PASS ✓");
  process.exit(0);
} else {
  console.log("");
  console.log("RESULT: FAIL ✗");
  process.exit(1);
}