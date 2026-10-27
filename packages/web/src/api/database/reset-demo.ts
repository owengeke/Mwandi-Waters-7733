/**
 * Restores the demo baseline in the HOSTED database (Turso).
 *
 * Applies docs/reset-demo.sql, which only touches Wanjiru's demo bill
 * (ACC-0001 / INV-00002) and the simulated STK transactions. It is safe for a
 * demo database and destructive nowhere else because it targets explicit rows.
 *
 * Guarded twice so it cannot fire by accident:
 *   - CONFIRM_HOSTED_RESET=yes must be set
 *   - HOSTED_DATABASE_URL must be a libsql/https URL (never a local file)
 *
 * Usage: CONFIRM_HOSTED_RESET=yes bun run db:reset-demo
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client/web";

const url = process.env.HOSTED_DATABASE_URL;
const authToken = process.env.HOSTED_DATABASE_AUTH_TOKEN;

if (process.env.CONFIRM_HOSTED_RESET !== "yes") {
  console.error(
    "Refusing to reset a hosted database without CONFIRM_HOSTED_RESET=yes.\n" +
      "Usage: CONFIRM_HOSTED_RESET=yes bun run db:reset-demo",
  );
  process.exit(1);
}

if (!url || url.startsWith("file:")) {
  console.error("HOSTED_DATABASE_URL must point at the hosted libSQL database.");
  process.exit(1);
}

const sqlPath = path.join(process.cwd(), "..", "..", "docs", "reset-demo.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean)
  .filter((statement) => !/^(BEGIN|COMMIT)$/i.test(statement));

const client = createClient({ url, authToken });

try {
  await client.batch(statements, "write");

  const client1 = await client.execute(
    "SELECT account_number, current_balance_kes FROM clients WHERE account_number = 'ACC-0001'",
  );
  const invoice = await client.execute(
    "SELECT invoice_number, status, amount_due_kes, amount_paid_kes FROM invoices WHERE invoice_number = 'INV-00002'",
  );
  const outstanding = await client.execute(
    "SELECT COUNT(*) AS open_bills FROM invoices WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE') AND client_id = 1",
  );

  console.log(`Applied ${statements.length} statements to ${url}`);
  console.log("client:   ", client1.rows[0]);
  console.log("invoice:  ", invoice.rows[0]);
  console.log("open bills:", outstanding.rows[0]?.open_bills);
} finally {
  client.close();
}
