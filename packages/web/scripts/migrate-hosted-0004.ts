/**
 * Migration 0004 for hosted Turso database (libSQL).
 *
 * Creates `meter_readings`, swaps invoices_client_period_idx from UNIQUE to a
 * plain index, and backfills a synthetic reading chain from existing invoices.
 *
 * This migration does NOT rebuild any table, so it is far simpler than 0003:
 * no FK toggling, no backup table, no RENAME. Each statement is still its own
 * execute() call so a failure points at one line.
 *
 * SAFETY REQUIREMENTS:
 * - CONFIRM_HOSTED_MIGRATION=yes must be set
 * - Aborts if `meter_readings` already exists (already migrated)
 *
 * Usage (local dry run against a copy of local.db):
 *   DATABASE_URL=file:tmp-verify.db CONFIRM_HOSTED_MIGRATION=yes \
 *     ALLOW_LOCAL_FILE=true bun run db:migrate-hosted-0004
 *
 * Usage (hosted):
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... CONFIRM_HOSTED_MIGRATION=yes \
 *     bun run db:migrate-hosted-0004
 */

import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL?.trim();
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
const confirm = process.env.CONFIRM_HOSTED_MIGRATION?.trim();

if (confirm !== "yes") {
  console.error("ABORT: Set CONFIRM_HOSTED_MIGRATION=yes to proceed.");
  process.exit(1);
}
if (!url) {
  console.error("ABORT: Set DATABASE_URL.");
  process.exit(1);
}
if (url.startsWith("file:")) {
  if (process.env.ALLOW_LOCAL_FILE?.trim() !== "true") {
    console.error("ABORT: file: URLs require ALLOW_LOCAL_FILE=true to be set explicitly.");
    process.exit(1);
  }
  console.warn("WARNING: Using local file: database. This is NOT for production use.");
} else if (!authToken) {
  console.error("ABORT: Set DATABASE_AUTH_TOKEN for a libsql:// URL.");
  process.exit(1);
}

const hostMatch = url.match(/libsql:\/\/([^/]+)/);
const hostDisplay = hostMatch ? hostMatch[1] : url;
console.log(`=== Migrating host: ${hostDisplay} ===\n`);

const client = createClient({ url, authToken });

async function exec(sql: string, label: string) {
  console.log(`  -> ${label}`);
  try {
    const result = await client.execute(sql);
    console.log(`     OK (${result.rowsAffected ?? 0} rows affected)`);
    return result;
  } catch (e: any) {
    console.error(`     FAILED: ${e.message}`);
    throw e;
  }
}

async function scalar(sql: string): Promise<number> {
  const result = await client.execute(sql);
  return Number(Object.values(result.rows[0] ?? {})[0] ?? 0);
}

async function rows(sql: string) {
  const result = await client.execute(sql);
  return result.rows;
}

// ---------- STEP 1: baseline ----------
console.log("=== STEP 1: Baseline ===");
const invCount = await scalar("SELECT COUNT(*) FROM invoices");
const payCount = await scalar("SELECT COUNT(*) FROM payments");
const clientCount = await scalar("SELECT COUNT(*) FROM clients");
console.log(`  invoices: ${invCount}`);
console.log(`  payments: ${payCount}`);
console.log(`  clients: ${clientCount}`);

const existing = await rows("SELECT name FROM sqlite_master WHERE type='table' AND name='meter_readings'");
if (existing.length > 0) {
  console.error("ABORT: meter_readings already exists — 0004 looks already applied.");
  process.exit(1);
}
console.log("  meter_readings absent: PASS\n");

// ---------- STEP 2: apply 0004 ----------
console.log("=== STEP 2: Apply 0004 statements ===");
const scriptDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
const normalizedScriptDir = scriptDir.startsWith("/") ? scriptDir.slice(1) : scriptDir;
const migrationPath = join(normalizedScriptDir, "..", "drizzle", "0004_pretty_vanisher.sql");
if (!existsSync(migrationPath)) {
  console.error(`ABORT: Migration file not found at ${migrationPath}`);
  process.exit(1);
}
console.log(`  Using migration file: ${migrationPath}`);

const sql = readFileSync(migrationPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .filter((s) => /^(PRAGMA|CREATE|INSERT|DROP|ALTER)\b/i.test(s));

console.log(`  Found ${statements.length} statements:`);
for (let i = 0; i < statements.length; i++) {
  const label = statements[i].slice(0, 70).replace(/\s+/g, " ");
  await exec(statements[i], `Statement ${i + 1}/${statements.length}: ${label}`);
}
console.log("  All statements applied\n");

// ---------- STEP 3: verify ----------
console.log("=== STEP 3: Verify ===");
const invAfter = await scalar("SELECT COUNT(*) FROM invoices");
const payAfter = await scalar("SELECT COUNT(*) FROM payments");
console.log(`  invoices after: ${invAfter} (was ${invCount})`);
console.log(`  payments after: ${payAfter} (was ${payCount})`);
if (invAfter !== invCount || payAfter !== payCount) {
  console.error("ABORT: Invoices or payments changed during migration.");
  process.exit(1);
}

const readings = await scalar("SELECT COUNT(*) FROM meter_readings");
const openings = await scalar("SELECT COUNT(*) FROM meter_readings WHERE is_opening = 1");
const billed = await scalar("SELECT COUNT(*) FROM meter_readings WHERE is_opening = 0");
console.log(`  meter_readings: ${readings} (${openings} opening, ${billed} billed)`);
if (billed !== invCount) {
  console.error(`ABORT: Expected ${invCount} billed readings, found ${billed}.`);
  process.exit(1);
}

// Units per client must match the sum of their invoice consumption.
const mismatches = await rows(`
  SELECT i.client_id,
         SUM(i.consumption_units) AS inv_units,
         (SELECT COALESCE(SUM(mr.units_consumed), 0) FROM meter_readings mr
           WHERE mr.client_id = i.client_id AND mr.is_opening = 0) AS reading_units
  FROM invoices i
  GROUP BY i.client_id
`);
const unitMismatch = mismatches.filter(
  (r: any) => Math.abs(Number(r.inv_units) - Number(r.reading_units)) > 0.005,
);
console.log(`  Clients with unit mismatch: ${unitMismatch.length}`);
if (unitMismatch.length > 0) {
  console.error(JSON.stringify(unitMismatch, null, 2));
  console.error("ABORT: Backfilled reading units do not match invoice units.");
  process.exit(1);
}

// Every client with invoices must have exactly one opening row.
const offeringsGap = await rows(`
  SELECT i.client_id
  FROM invoices i
  LEFT JOIN meter_readings o ON o.client_id = i.client_id AND o.is_opening = 1
  GROUP BY i.client_id
  HAVING COUNT(DISTINCT o.id) != 1
`);
console.log(`  Clients missing an opening row: ${offeringsGap.length}`);
if (offeringsGap.length > 0) {
  console.error(JSON.stringify(offeringsGap, null, 2));
  process.exit(1);
}

// Cumulative chain: newest reading equals the running total of all invoices.
const chainBad = await rows(`
  SELECT mr.client_id, mr.reading_value, mr.previous_reading, mr.units_consumed
  FROM meter_readings mr
  JOIN (
    SELECT client_id, MAX(id) AS id FROM meter_readings WHERE is_opening = 0 GROUP BY client_id
  ) last ON last.id = mr.id
  WHERE ABS(
    ABS(CAST(mr.previous_reading AS REAL) + CAST(mr.units_consumed AS REAL))
    - ABS(CAST(mr.reading_value AS REAL))
  ) > 0.005
`);
console.log(`  Chain arithmetic errors: ${chainBad.length}`);

const fk = await rows("PRAGMA foreign_key_check");
console.log(`  FK violations: ${fk.length}`);
if (fk.length > 0) {
  console.error(JSON.stringify(fk, null, 2));
}

const indexes = await rows("PRAGMA index_list(meter_readings)");
console.log(`  Indexes on meter_readings: ${indexes.map((r: any) => r.name).join(", ")}`);
const clientPeriod = await rows("PRAGMA index_list(invoices)");
const periodIdx = clientPeriod.find((r: any) => r.name === "invoices_client_period_idx");
console.log(`  invoices_client_period_idx unique: ${periodIdx?.unique ?? "MISSING"}`);
if (periodIdx?.unique !== 0) {
  console.error("ABORT: invoices_client_period_idx should be non-unique after 0004.");
  process.exit(1);
}

// ---------- STEP 4: report ----------
console.log("\n=== REPORT: not backfillable ===");
const noInvoiceClients = await rows(`
  SELECT c.id, c.account_number, c.full_name
  FROM clients c
  WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.client_id = c.id)
`);
console.log(`  Clients with no invoices (need an opening reading set manually): ${noInvoiceClients.length}`);
for (const c of noInvoiceClients as any[]) {
  console.log(`    ${c.account_number} ${c.full_name}`);
}
console.log("  Absolute meter numbers are synthesised (opening = 0); real values were never stored.");

console.log("\n=== MIGRATION SUMMARY ===");
console.log(`  Host: ${hostDisplay}`);
console.log(`  invoices: ${invAfter}`);
console.log(`  meter_readings: ${readings} (${openings} opening, ${billed} billed)`);
console.log(`  FK violations: ${fk.length}`);
console.log(`  Unit mismatches: ${unitMismatch.length}`);

if (fk.length === 0 && unitMismatch.length === 0 && offeringsGap.length === 0 && chainBad.length === 0) {
  console.log("\nRESULT: PASS");
  process.exit(0);
}
console.log("\nRESULT: FAIL");
process.exit(1);
