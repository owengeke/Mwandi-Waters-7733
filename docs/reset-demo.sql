-- Reset only Wanjiru's demo bill after a rehearsal.
-- Safe to run against the hosted demo database:
--   turso db shell mwandi-waters < .\docs\reset-demo.sql
-- It removes simulated STK transactions and any payments posted during the
-- demo, then restores INV-00002 to the seeded KES 1,560 outstanding state.
-- Seeded payment history for the other clients is untouched.

BEGIN;

DELETE FROM mpesa_transactions;

DELETE FROM payments
WHERE client_id = (SELECT id FROM clients WHERE account_number = 'ACC-0001')
  AND mpesa_receipt_number NOT IN (
    'QA00000001',
    'QA00000002',
    'QA00000003',
    'QA00000004',
    'QX891234AB',
    'QZ551200JK'
  );

UPDATE invoices
SET amount_paid_kes = 1200,
    status = 'OVERDUE'
WHERE invoice_number = 'INV-00002';

UPDATE invoices
SET amount_paid_kes = 2310,
    status = 'PAID'
WHERE invoice_number = 'INV-00001';

UPDATE clients
SET current_balance_kes = 1560
WHERE account_number = 'ACC-0001';

COMMIT;
