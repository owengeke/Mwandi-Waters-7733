/*
 * Read-only duplicate check for hosted DB before running migration 0003.
 * Run this against the hosted Turso database to verify no duplicate
 * (client_id, billing_period_start) pairs exist before adding the unique index.
 *
 * Expected: 0 rows returned.
 */
SELECT client_id, billing_period_start, COUNT(*) AS cnt
FROM invoices
GROUP BY client_id, billing_period_start
HAVING COUNT(*) > 1;