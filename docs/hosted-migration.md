# Hosted Database Migration (0003) — Turso Steps

**Prerequisites:**
- Turso CLI installed (`curl -sSfL https://get.tur.so/install.sh | bash`)
- Authenticated: `turso auth login`
- Database URL: `libsql://mwandi-waters-owengeke.aws-eu-central-1.turso.io`
- Token with full permissions (create new token, delete any exposed token)

---

## Step 0 — Create a copy of the hosted DB first (safety)

```bash
# Create a replica for safety; you can test against this first
turso db copy mwandi-waters mwandi-waters-migration-test
# Get its URL and token
turso db show mwandi-waters-migration-test --url
turso db tokens create mwandi-waters-migration-test
```

---

## Step 1 — Record baseline counts

```bash
# Connect to the hosted DB (or the test copy)
turso db shell mwandi-waters "SELECT COUNT(*) AS invoices FROM invoices;"
turso db shell mwandi-waters "SELECT COUNT(*) AS payments FROM payments;"
turso db shell mwandi-waters "SELECT invoice_number, client_id, billing_period_start FROM invoices WHERE invoice_number = 'INV-00002';"
```

**Expected (baseline):**
- invoices: 24
- payments: 21
- INV-00002: client_id = 1, billing_period_start = '2026-09-01'

---

## Step 2 — Run duplicate check

```bash
turso db shell mwandi-waters < docs/check-duplicates.sql
```

**Expected:** 0 rows returned. If rows returned, resolve duplicates before proceeding.

---

## Step 3 — Create payments_link_backup

```bash
turso db shell mwandi-waters "CREATE TABLE payments_link_backup AS SELECT id, invoice_id FROM payments;"
```

Verify:
```bash
turso db shell mwandi-waters "SELECT COUNT(*) FROM payments_link_backup;"
```
Expected: 21

---

## Step 4 — Run 0003 statements ONE AT A TIME in a single shell session

**CRITICAL:** Each statement must be its own call to `turso db shell`. Do NOT combine with semicolons. Do NOT wrap in BEGIN...COMMIT. The PRAGMA foreign_keys=OFF only works per-statement outside a transaction.

```bash
# 1. Disable FK checks
turso db shell mwandi-waters "PRAGMA foreign_keys=OFF;"

# 2. Verify it's off
turso db shell mwandi-waters "PRAGMA foreign_keys;"
# Expected output: 0

# 3. Create new invoices table
turso db shell mwandi-waters "CREATE TABLE __new_invoices (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, client_id integer NOT NULL, invoice_number text NOT NULL, billing_period_start text NOT NULL, billing_period_end text NOT NULL, consumption_units numeric NOT NULL, rate_per_unit_kes numeric, issued_by text, issued_at integer, amount_due_kes numeric GENERATED ALWAYS AS (CASE WHEN rate_per_unit_kes IS NULL THEN round(consumption_units * 150, 2) ELSE round(consumption_units * rate_per_unit_kes, 2) END) STORED, amount_paid_kes numeric DEFAULT 0 NOT NULL, due_date text NOT NULL, status text DEFAULT 'UNPAID' NOT NULL, created_at integer NOT NULL, updated_at integer NOT NULL, FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE no action ON DELETE restrict, CONSTRAINT invoices_status_chk CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')), CONSTRAINT invoices_units_chk CHECK (consumption_units >= 0), CONSTRAINT invoices_rate_chk CHECK (rate_per_unit_kes IS NULL OR rate_per_unit_kes > 0), CONSTRAINT invoices_paid_chk CHECK (amount_paid_kes >= 0), CONSTRAINT invoices_period_chk CHECK (billing_period_end >= billing_period_start));"

# 4. Copy data (rate_per_unit_kes, issued_by, issued_at start as NULL)
turso db shell mwandi-waters "INSERT INTO __new_invoices (id, client_id, invoice_number, billing_period_start, billing_period_end, consumption_units, rate_per_unit_kes, issued_by, issued_at, amount_paid_kes, due_date, status, created_at, updated_at) SELECT id, client_id, invoice_number, billing_period_start, billing_period_end, consumption_units, NULL, NULL, NULL, amount_paid_kes, due_date, status, created_at, updated_at FROM invoices;"

# 5. Drop old table (THIS IS WHERE FK ON DELETE SET NULL WOULD FIRE INSIDE A TX)
turso db shell mwandi-waters "DROP TABLE invoices;"

# 6. Rename new table
turso db shell mwandi-waters "ALTER TABLE __new_invoices RENAME TO invoices;"

# 7. Re-enable FK checks
turso db shell mwandi-waters "PRAGMA foreign_keys=ON;"

# 8. Verify FK is back on
turso db shell mwandi-waters "PRAGMA foreign_keys;"
# Expected output: 1

# 9. Recreate indexes
turso db shell mwandi-waters "CREATE UNIQUE INDEX invoices_invoice_number_unique ON invoices (invoice_number);"
turso db shell mwandi-waters "CREATE INDEX invoices_client_idx ON invoices (client_id);"
turso db shell mwandi-waters "CREATE INDEX invoices_status_idx ON invoices (status);"
turso db shell mwandi-waters "CREATE INDEX invoices_due_date_idx ON invoices (due_date);"
turso db shell mwandi-waters "CREATE UNIQUE INDEX invoices_client_period_idx ON invoices (client_id, billing_period_start);"
```

---

## Step 5 — Verify counts, links, and amounts

```bash
# Counts
turso db shell mwandi-waters "SELECT COUNT(*) AS invoices FROM invoices;"
turso db shell mwandi-waters "SELECT COUNT(*) AS payments FROM payments;"

# FK integrity
turso db shell mwandi-waters "PRAGMA foreign_key_check;"

# Payment links preserved
turso db shell mwandi-waters "SELECT COUNT(*) AS mismatches FROM payments p JOIN payments_link_backup b ON b.id = p.id WHERE p.invoice_id IS NOT b.invoice_id;"
# Expected: 0

# Amounts correct
turso db shell mwandi-waters "SELECT COUNT(*) AS bad FROM invoices WHERE ABS(CAST(amount_due_kes AS REAL) - CAST(consumption_units AS REAL) * 150) > 0.005;"
# Expected: 0

# Wanjiru INV-00002 outstanding = 1560
turso db shell mwandi-waters "SELECT i.invoice_number, i.consumption_units, i.amount_due_kes, i.amount_paid_kes, (i.amount_due_kes - i.amount_paid_kes) AS outstanding, i.status FROM invoices i JOIN clients cl ON cl.id = i.client_id WHERE cl.account_number = 'ACC-0001' AND i.invoice_number = 'INV-00002';"
# Expected: 18.4 units, 2760 due, 1200 paid, 1560 outstanding, OVERDUE
```

---

## Step 6 — Backfill rate_per_unit_kes = 150 (only after verification)

```bash
# Verify all invoices have billed = units * 150 before backfill
turso db shell mwandi-waters "SELECT COUNT(*) FROM invoices WHERE ABS(CAST(amount_due_kes AS REAL) - CAST(consumption_units AS REAL) * 150) > 0.005;"
# Must be 0

# Backfill
turso db shell mwandi-waters "UPDATE invoices SET rate_per_unit_kes = 150 WHERE rate_per_unit_kes IS NULL;"

# Verify backfill
turso db shell mwandi-waters "SELECT COUNT(*) AS null_rates FROM invoices WHERE rate_per_unit_kes IS NULL;"
# Expected: 0
```

---

## Step 7 — Drop backup table (LAST step)

```bash
turso db shell mwandi-waters "DROP TABLE payments_link_backup;"
```

---

## Step 8 — Final verification

```bash
turso db shell mwandi-waters "SELECT COUNT(*) AS invoices FROM invoices;"
turso db shell mwandi-waters "SELECT COUNT(*) AS payments FROM payments;"
turso db shell mwandi-waters "PRAGMA foreign_key_check;"
turso db shell mwandi-waters "SELECT COUNT(*) FROM invoices WHERE rate_per_unit_kes IS NULL;"
turso db shell mwandi-waters "SELECT invoice_number, client_id, billing_period_start FROM invoices WHERE invoice_number = 'INV-00002';"
```

---

## ⚠️ What NOT to do

- **Never** run via `drizzle-kit migrate` or any `db:migrate` script
- **Never** wrap statements in `BEGIN...COMMIT`
- **Never** run multiple statements in one `turso db shell` call (use one call per statement)
- **Never** skip the `payments_link_backup` safety table
- **Never** backfill `rate_per_unit_kes` before verifying `amount_due_kes = units * 150` for all rows

---

## Emergency Repair (if links were nulled)

If Step 5 shows mismatches > 0:

```bash
turso db shell mwandi-waters "UPDATE payments SET invoice_id = (SELECT b.invoice_id FROM payments_link_backup b WHERE b.id = payments.id) WHERE invoice_id IS NULL;"
turso db shell mwandi-waters "SELECT COUNT(*) AS mismatches FROM payments p JOIN payments_link_backup b ON b.id = p.id WHERE p.invoice_id IS NOT b.invoice_id;"
# Must be 0 before dropping backup
```

---

## If It Fails Midway

**Do NOT re-run blindly.** The database will be in an intermediate state. Assess exactly which step failed:

| Failed at step | Database state | Recovery action |
|----------------|----------------|-----------------|
| Step 3 (PRAGMA) | Unchanged | Re-run from Step 3 |
| Step 4a (CREATE __new_invoices) | `__new_invoices` exists, `invoices` intact | `DROP TABLE __new_invoices;`, then re-run from Step 4a |
| Step 4b (INSERT) | `__new_invoices` has data, `invoices` intact | `DELETE FROM __new_invoices;`, re-run Step 4b |
| **Step 4c (DROP TABLE invoices)** | **`invoices` GONE, data in `__new_invoices`** | **Do NOT re-run DROP.** Run: `ALTER TABLE __new_invoices RENAME TO invoices;` then re-run from Step 4d |
| Step 4d (RENAME) | `__new_invoices` renamed to `invoices` (OK) | Continue from Step 4e |
| Step 4e (PRAGMA ON) | FK off | Run `PRAGMA foreign_keys=ON;` then continue |
| Step 4f+ (indexes) | Partial indexes | Re-run missing `CREATE INDEX` statements |
| Step 5+ (verification) | Migration complete | Run repair if needed, then continue |

**Critical: If DROP TABLE ran but RENAME did not**, you have no `invoices` table but all data is in `__new_invoices`. The fix is a single statement:
```bash
turso db shell mwandi-waters "ALTER TABLE __new_invoices RENAME TO invoices;"
```
Then continue with `PRAGMA foreign_keys=ON;` and the index creation steps.

**If you cannot determine the state:** Stop. Use the copy you made in Step 0:
```bash
# Delete the failed DB and re-copy from the original
turso db delete mwandi-waters-migration-failed
turso db copy mwandi-waters mwandi-waters-migration-test
```
Then start from Step 1 on the fresh copy.

**Never** run the migration script a second time on a database that already has `__new_invoices` or is missing `invoices` — it will abort with "table already exists" or corrupt data.