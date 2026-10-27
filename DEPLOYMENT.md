# Deployment & demo runbook

This is the exact path from the local demo to a Vercel preview, plus the
M-Pesa callback setup and the demo script. **Nothing here has been run against
a hosted database yet.** The hosted-database step needs approval first.

---

## 1. Hosted database — proposal (approval required)

**Recommendation: Turso Free ($0, no card).**

Why Turso:

- The app already uses `@libsql/client` and `drizzle-orm/libsql`, so no schema
  or application changes are needed.
- It is serverless-friendly: the API keeps no local files and no in-memory
  payment state, which matches the Daraja callback design.
- One small database is enough for the demo. Check current free-tier limits
  when you create it; these steps do not create any paid resource.

**What changes:** only two Vercel environment variables —
`DATABASE_URL` and `DATABASE_AUTH_TOKEN`. No code changes.

### 1a. Create the database (after approval)

> **Windows note:** the Turso CLI requires WSL. This machine does not have WSL
> installed, so use the Turso dashboard instead (or install WSL first). The CLI
> commands below are for macOS, Linux, or WSL.

Use the Turso dashboard (turso.tech → sign in → **Create Database**). Choose
the free plan and name it `mwandi-waters`. Before uploading, build a clean
WAL-mode snapshot (Turso requires WAL; `local.db` may be in `delete` mode):

```powershell
cd packages\web
bun run db:snapshot
```

This writes `packages\web\mwandi-waters-upload.db`, validates its integrity,
and confirms Wanjiru's KES 1,560 balance. Upload **that** file, not `local.db`.

> If the upload dialog says **group not found**, the organization has no
> database group yet. Create an empty database first with the **New Database**
> tab and a concrete **Location** (for example London or Frankfurt), then retry
> the upload. Alternatively create a group named `default` under the
> dashboard's **Groups** page and select it.

From macOS/Linux/WSL, the equivalent CLI command is:

```powershell
turso auth signup
turso db create mwandi-waters --from-file .\packages\web\mwandi-waters-upload.db
turso db show mwandi-waters --url
turso db tokens create mwandi-waters
```

`--from-file` imports both the schema and the seeded demo data, so Wanjiru's
KES 1,560 bill is present on the hosted database. Stop the local dev server
before importing the file so the snapshot is consistent.

### 1b. Alternative: empty database + migrations

Only use this if you do **not** want the demo data. It creates the schema but
no clients, invoices, or logins:

```powershell
cd packages\web
$env:DATABASE_URL = "libsql://<database>-<org>.turso.io"
$env:DATABASE_AUTH_TOKEN = "<token>"
bunx drizzle-kit migrate
```

The migration files are `drizzle/0000_init.sql` through
`drizzle/0002_dashing_punisher.sql`. Use `migrate`, not `push`: `push` fails on
the generated `invoices.amount_due_kes` column.

### 1c. Verify the hosted import

Copy the database URL and token from the Turso dashboard into the root `.env`
(local only; never commit them):

```text
HOSTED_DATABASE_URL=libsql://...
HOSTED_DATABASE_AUTH_TOKEN=...
```

Then run the read-only check:

```powershell
cd packages\web
bun run db:verify-hosted
```

It must report **Wanjiru 1,560 | INV-00002 OVERDUE 2,760 due / 1,200 paid**
and exit successfully. The Vercel variables are still named `DATABASE_URL` and
`DATABASE_AUTH_TOKEN`; the `HOSTED_*` names are only for local verification.

### 1d. Seeding rules

- `bun run db:seed` is **local only**. It now refuses any `DATABASE_URL` that
  does not start with `file:`, even when `ALLOW_RESEED=true`.
- Never run the seed against Turso, staging, or production. To get demo data
  into Turso, import the local snapshot with `--from-file` (step 1a).
- Back up the local database before every reseed:

```powershell
cd packages\web
Copy-Item local.db local.db.bak -Force
$env:ALLOW_RESEED = "true"
bun run db:seed
Remove-Item Env:\ALLOW_RESEED
```

### 1e. Rollback

- Delete the Turso database from the dashboard.
- Point `DATABASE_URL` back at `file:local.db` for local work.
- Delete the Vercel deployment if you no longer need it.

---

## 2. Vercel deployment

The Vercel files are already in the repo:

- `packages/web/vercel.json` — Vite build, SPA fallback, `/api/*` rewrite.
- `packages/web/api/index.ts` — the Vercel Node function entry. It adapts
  Vercel's `(req, res)` handler to the same Hono app as local production,
  including request bodies and `Set-Cookie` headers.

### 2a. Push the repo

The local `main` branch is ahead of `origin/main`:

```powershell
git status
git push origin main
```

### 2b. Import the project

1. Vercel dashboard → **Add New…** → **Project** → import the GitHub repo.
2. Set **Root Directory** to `packages/web` (click **Edit** next to Root
   Directory). This is required: `vercel.json` and `api/index.ts` live there.
3. Framework Preset: **Vite**.
4. Build Command: `bun run build`.
5. Output Directory: `dist`.
6. Install Command: leave the default (`bun install`). Vercel detects the
   root `bun.lock`; if asked, allow it to include files outside the Root
   Directory so the workspace install can run.
7. Add the environment variables from the table below for **Production** (and
   **Preview** if you will use preview URLs).
8. Deploy.

### 2c. Environment variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `WEBSITE_URL` | Yes | `https://mwandi-waters.vercel.app` | Exact public origin. Used by Better Auth as `baseURL`. Must match the browser URL, no trailing slash. |
| `BETTER_AUTH_SECRET` | Yes | long random string | At least 32 random characters. Changing it signs everyone out. |
| `DATABASE_URL` | Yes | `libsql://mwandi-waters-<org>.turso.io` | Hosted libSQL URL from Turso. |
| `DATABASE_AUTH_TOKEN` | Yes | `<token>` | Turso database token. Server-side only. |
| `MPESA_ENV` | No | `sandbox` | `sandbox` or `production`. Defaults to sandbox. |
| `MPESA_CONSUMER_KEY` | No | `<key>` | Leave all five M-Pesa credentials empty for demo mode. |
| `MPESA_CONSUMER_SECRET` | No | `<secret>` | Server-side only. |
| `MPESA_SHORTCODE` | No | `174379` | Sandbox test shortcode; use your paybill in production. |
| `MPESA_PASSKEY` | No | `<passkey>` | Lipa na M-Pesa Online passkey. |
| `MPESA_CALLBACK_URL` | No | `https://mwandi-waters.vercel.app/api/mpesa/callback` | Public HTTPS callback. Required for real STK. |
| `MPESA_PAYBILL_DISPLAY` | No | `522533` | Paybill shown as the manual fallback. |
| `WHATSAPP_PHONE_NUMBER_ID` | No | `<id>` | Only for WhatsApp OTP sign-in. |
| `WHATSAPP_ACCESS_TOKEN` | No | `<token>` | Only for WhatsApp OTP sign-in. |
| `WHATSAPP_OTP_TEMPLATE` | No | `mwandi_otp` | Defaults to `mwandi_otp`. |
| `WHATSAPP_OTP_TEMPLATE_LANG` | No | `en` | Defaults to `en`. |
| `WHATSAPP_API_VERSION` | No | `v23.0` | Defaults to `v23.0`. |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | No | — | SMS fallback. |
| `ALLOW_RESEED` | **No** | — | Never set this on Vercel. The seed is local-only anyway. |

Do **not** set `VITE_WEBSITE_URL` unless you deliberately want to bake a
different API origin into the browser bundle. The client falls back to
`window.location.origin`, which is correct on Vercel.

If you use a custom domain, update both `WEBSITE_URL` and
`MPESA_CALLBACK_URL` and redeploy.

### 2d. Verify the deployment

1. `https://<your-app>.vercel.app/api/health` returns `{"status":"ok"}`.
2. The sign-in page loads and a client can sign in.
3. Refresh a nested page such as `/dashboard`; the SPA rewrite must return the
   app, not a 404.
4. Vercel → your project → **Functions** → `api/index` shows the logs for
   `/api/rpc/*`, `/api/auth/*`, the callback, and receipts.

### 2e. Common deployment failures

| Symptom | Fix |
| --- | --- |
| `/api/*` returns 404 | Root Directory is not `packages/web`, or `vercel.json` was not picked up. |
| Nested page 404s on refresh | The SPA rewrite is missing; confirm `packages/web/vercel.json` is deployed. |
| Sign-in says invalid origin / redirects to localhost | `WEBSITE_URL` is wrong, or `VITE_WEBSITE_URL` was set to localhost at build time. |
| `500` from `/api/rpc/*` | Check function logs; usually `DATABASE_URL`/token or a missing migration. |
| Callback never arrives | `MPESA_CALLBACK_URL` is not public HTTPS, or Daraja rejected the URL. Check the STK response and `mpesa_transactions`. |
| Receipt returns 401/404 | You are signed out, or the payment belongs to another client (ownership is enforced). |

---

## 3. Daraja callback setup

The callback endpoint is:

```text
https://<your-app>.vercel.app/api/mpesa/callback
```

Steps:

1. In the Safaricom Daraja portal, open your app → **Lipa na M-Pesa Online**.
2. Set the callback URL to the URL above if the portal asks for one. The app
   also sends this value as `CallBackURL` on every STK request, so
   `MPESA_CALLBACK_URL` must match the deployed domain.
3. Set `MPESA_ENV`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`,
   `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, and `MPESA_CALLBACK_URL` in
   Vercel, then redeploy.
4. Use a sandbox test number (for example `254708374149`) for the first real
   STK test. Approve the prompt on the phone.
5. Confirm the callback updates the invoice and balance, and that the receipt
   PDF is available from the Payments section.

Notes:

- The endpoint is public but validates the payload and is idempotent. Sending
  the same callback twice returns `200` and posts the payment once.
- All Daraja secrets stay server-side; the browser only receives the STK
  result and the demo/real mode flag.
- If any of the five M-Pesa values is missing, the app stays in **Demo mode**
  and never calls Safaricom.

---

## 4. Demo script (Wanjiru / INV-00002 / KES 1,560)

Preconditions: the database has the seeded baseline, and the five `MPESA_*`
credentials are empty (so the demo badge is visible). Sign in at
`https://<your-app>.vercel.app/login`.

1. **Sign in as the client.** Use `wanjiru@example.co.ke` / `Mwandi@2026`, or
   phone `0712 345 678`, or account `ACC-0001`.
2. **Overview.** Point out the balance card: **KES 1,560 outstanding**.
3. **Bills.** Open the Bills section. `INV-00002` is the September 2026 bill:
   18.4 m³, KES 2,760 due, KES 1,200 already paid, due 20 Oct 2026, status
   **Overdue**, remaining **KES 1,560**.
4. **Pay.** Click **Pay** on that bill. The dialog is prefilled with the
   invoice number, period, units, the exact outstanding amount (KES 1,560),
   and the remaining balance. The phone defaults to `0712 345 678`.
5. **Confirm.** The button shows the amount. Because there are no cents, no
   rounding is applied. In demo mode the dialog shows a clear **Demo mode**
   badge and simulates a successful M-Pesa payment.
6. **Result.** The invoice becomes **Paid**, the balance becomes **KES 0**,
   and the payment appears in the Payments section.
7. **Receipt.** Click the receipt action on the payment. A server-generated PDF
   opens from `/api/receipts/<paymentId>.pdf`; it shows the client, invoice,
   amount, M-Pesa receipt number, and date.
8. **Staff view.** Sign in as `staff@mwandiwaters.co.ke` / `Mwandi@2026`.
   `/staff/payments` (the ledger) shows the new payment. Visit `/admin` to show
   that the nested admin route loads instead of a blank screen; visiting
   `/dashboard` as staff redirects to `/staff`.

### Real STK variant

1. Set all five M-Pesa credentials plus `MPESA_CALLBACK_URL` in Vercel.
2. Redeploy so the function picks up the new environment.
3. Repeat steps 1–4 with a sandbox test phone number.
4. The phone receives the STK prompt; approving it triggers the callback and
   the same Paid/balance/receipt outcome.

### Reset between rehearsals

- **Local:** stop the dev server, back up `local.db`, then run the guarded seed
  (section 1c).
- **Hosted:** run `docs/reset-demo.sql` against Turso:

```powershell
turso db shell mwandi-waters < .\docs\reset-demo.sql
```

This restores only Wanjiru's baseline bill and balance and removes demo STK
transactions. It does not touch other clients or the seeded payment history.

---

## 5. Pre-demo security checklist

- [ ] No secrets in git; `.env` is ignored.
- [ ] `ALLOW_RESEED` is not set on Vercel.
- [ ] `BETTER_AUTH_SECRET` is a fresh random value, not the local one.
- [ ] Demo passwords are changed or the demo accounts are removed before real
      client data is loaded.
- [ ] Turso token is scoped to this database and rotated if it leaks.
- [ ] Receipt access is authenticated and ownership-checked (already enforced
      in `routes/mpesa.ts`).
- [ ] `/api/health` is green and the callback URL is HTTPS.
