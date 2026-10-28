# Mwandi Waters — Project Summary

A water utility billing platform: clients manage their account and pay bills
with M-Pesa; staff and administrators see the ledger. Production is live at
**https://mwandi-waters-7733-4n4j.vercel.app**.

## What it is

Mwandi Waters is a small water utility serving four client accounts. Each
client has a meter, a monthly bill, and an M-Pesa payment path. Staff and
administrators get a separate console for collections, arrears, and the
connection pipeline.

This is a **demo**. Daraja credentials are not configured, so every payment is
simulated and clearly labelled "Demo mode" — no money moves. Real STK Push
activates automatically when the five `MPESA_*` variables are set.

## Architecture

```
packages/web/
  api/           Vercel serverless entry (Hono + oRPC)
    index.ts     (req, res) ? Hono fetch handler
    _bundle.mjs  bundled app, emitted by `bun run build:api`
    __core/app.ts  CORS, /api/health, oRPC at /api/rpc/*
    routes/      portal, account, dashboard, installations,
                 clients, invoices, payments, mpesa
    lib/         money, billing, ledger, daraja, roles, receipt...
    database/    schema, seed, snapshot, verify-hosted, reset-demo
  web/            Vite + React + Tailwind client
    pages/        login, dashboard, account, staff, admin
    components/   client shell, payment dialog, data table, modal...
    lib/          oRPC client, auth, receipts, roles
```

- **API layer**: Hono mounts oRPC procedures at `/api/rpc/*`, Better Auth at
  `/api/auth/*`, the M-Pesa callback at `/api/mpesa/callback`, and PDF receipts
  at `/api/receipts/:paymentId.pdf`.
- **Auth**: Better Auth with email/password and WhatsApp OTP. Roles are
  `super_admin`, `admin`, `staff`, `client`. The client portal and the
  operator console are separate route trees, each with its own guard.
- **Database**: Turso libSQL (remote) or a local `file:` SQLite. Drizzle ORM.
  Money is NUMERIC, stored as Kenyan shillings with integer-cent arithmetic.
- **Build**: `bun install`, `bun run build:ci` (typecheck ? build:api ? vite
  build). The function ships as a single bundled ESM file because Vercel's Node
  runtime rejects `require()` of ESM-only packages.

## The demo flow

1. Sign in as **Wanjiru** (`0712 345 678` / `Mwandi@2026`).
2. Overview shows **KES 1,560.00 outstanding**, INV-00002 overdue 20 Oct 2026.
3. Open the payment dialog: invoice, billing period, 18.4 units, 2,760 billed
   / 1,200 paid / 1,560 remaining, phone prefilled to `0712 345 678`.
4. Confirm. The button shows the amount; the dialog displays a **Demo mode**
   badge. The invoice becomes Paid, the balance drops to 0.
5. Download the receipt — a server-generated PDF at
   `/api/receipts/<paymentId>.pdf`, auth and ownership enforced.
6. As **staff**, `/staff` shows the overview and `/staff/payments` the ledger.
   As **admin**, `/admin/payments` renders (nested routes work, no blank
   screen).

## Roles and logins

All passwords are `Mwandi@2026`. The login page accepts phone, account number,
or email.

| Role | Email | Phone | Account |
| --- | --- | --- | --- |
| Client | `wanjiru@example.co.ke` | `0712 345 678` | `ACC-0001` |
| Staff | `staff@mwandiwaters.co.ke` | `+254700000003` | — |
| Admin | `admin@mwandiwaters.co.ke` | `+254700000002` | — |
| Super admin | `super@mwandiwaters.co.ke` | `+254700000001` | — |

## Live setup

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full runbook. The deployed
project is `mwandi-waters-7733-4n4j` with Root Directory `packages/web`,
`bun install`, `bun run build:ci`, output `dist`, Node 24.x. Environment
variables for Production and Preview: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`,
`BETTER_AUTH_SECRET`, `WEBSITE_URL`.

## Resetting the demo

- **Hosted**: `cd packages/web && CONFIRM_HOSTED_RESET=yes bun run db:reset-demo`
- **Local**: back up `local.db`, then the guarded seed (refuses non-`file:` URLs)

Both restore Wanjiru's baseline — balance 1,560, INV-00002 OVERDUE, 1,200
paid — and remove simulated STK transactions. Other clients are untouched.

## Source of truth

- `DEPLOYMENT.md` — how to deploy, verify, and reset
- `design.md` — the original design notes
- `docs/reset-demo.sql` — the hosted reset script
- `README.md` — template contract for the workspace commands