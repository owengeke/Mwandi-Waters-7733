/**
 * Read-only verification of the hosted demo database.
 *
 *   HOSTED_DATABASE_URL=libsql://... HOSTED_DATABASE_AUTH_TOKEN=... bun run db:verify-hosted
 *
 * The token is never printed. This script only runs SELECTs.
 */
import { createClient } from "@libsql/client";

const url = process.env.HOSTED_DATABASE_URL?.trim();
const authToken = process.env.HOSTED_DATABASE_AUTH_TOKEN?.trim();

if (!url || url.startsWith("file:")) {
  console.error("Set HOSTED_DATABASE_URL to the hosted libsql:// URL (not file:local.db).");
  process.exit(1);
}
if (!authToken) {
  console.error("Set HOSTED_DATABASE_AUTH_TOKEN.");
  process.exit(1);
}

const client = createClient({ url, authToken });

const scalar = async (sql: string) => {
  const result = await client.execute(sql);
  return Number(Object.values(result.rows[0] ?? {})[0] ?? 0);
};

const tableCounts: Record<string, number> = {};
for (const table of [
  "clients",
  "installation_requests",
  "invoices",
  "payments",
  "mpesa_transactions",
  "user",
  "account",
  "session",
]) {
  try {
    tableCounts[table] = await scalar(`select count(*) from ${table}`);
  } catch {
    tableCounts[table] = -1;
  }
}

const wanjiru = (
  await client.execute(
    "select account_number, full_name, current_balance_kes from clients where account_number = 'ACC-0001'",
  )
).rows[0];

const invoice = (
  await client.execute(
    `select invoice_number, status, amount_paid_kes, amount_due_kes, due_date
     from invoices where invoice_number = 'INV-00002'`,
  )
).rows[0];

console.log(JSON.stringify({ tableCounts, wanjiru, invoice }, null, 2));

const balance = Number(wanjiru?.current_balance_kes);
const status = String(invoice?.status ?? "");
const due = Number(invoice?.amount_due_kes);
const paid = Number(invoice?.amount_paid_kes);

if (balance !== 1560 || status !== "OVERDUE" || due !== 2760 || paid !== 1200) {
  console.error("Baseline mismatch: expected Wanjiru balance 1,560 and INV-00002 OVERDUE 2,760/1,200.");
  process.exitCode = 1;
} else {
  console.log("Baseline OK: Wanjiru 1,560 | INV-00002 OVERDUE 2,760 due / 1,200 paid.");
}
