/**
 * Demo data for local development. Runs through the real procedures so
 * identifiers, balances, and invoice statuses follow production logic.
 *   bun run db:seed   (from packages/web)
 */
import { call } from "@orpc/server";
import { router } from "../index";
import { db } from "./index";
import { payments, invoices, clients, installationRequests, user, session, account, verification } from "./schema";
import { auth } from "../auth";

export const DEMO_PASSWORD = "Mwandi@2026";

async function createLogin(u: { name: string; email: string; role: string; phoneNumber?: string; clientId?: number }) {
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({ ...u, emailVerified: true });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(DEMO_PASSWORD),
  });
  return created;
}

const ctx = { context: { headers: new Headers() } };
// Seed runs as a super_admin so operator-guarded procedures accept the calls.
const run = <T>(proc: any, input?: unknown): Promise<T> => call(proc, input, ctx as any);

async function main() {
  // Destructive: the seed deletes every row. Never allow an accidental run
  // against a hosted or production database.
  if (process.env.ALLOW_RESEED !== "true") {
    console.error(
      "Refusing to reseed. This script deletes all data.\n" +
        "Set ALLOW_RESEED=true explicitly (and back up local.db first) to continue.",
    );
    process.exit(1);
  }

  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);
  await db.delete(payments);
  await db.delete(installationRequests);
  await db.delete(invoices);
  await db.delete(clients);
  await db.run("DELETE FROM sqlite_sequence");

  const superAdmin = await createLogin({ name: "Grace Wambui", email: "super@mwandiwaters.co.ke", role: "super_admin", phoneNumber: "+254700000001" });
  const seedSession = await (await auth.$context).internalAdapter.createSession(superAdmin.id);
  ctx.context.headers = new Headers({ Authorization: `Bearer ${seedSession.token}` });

  const applicants = [
    ["Wanjiru Kamau", "0712345678", "Plot 14, Kahawa Sukari, Nairobi"],
    ["Otieno Ochieng", "0722113344", "Milimani Estate, Kisumu"],
    ["Amina Hassan", "0733998877", "Nyali Road, Mombasa"],
    ["Kipchoge Rotich", "0798456123", "Elgon View, Eldoret"],
    ["Njeri Mwangi", "0701223344", "Section 58, Nakuru"],
    ["Mutua Kioko", "0110556677", "Syokimau, Machakos"],
  ];
  const reqs: any[] = [];
  for (const [fullName, phoneNumber, physicalAddress] of applicants) {
    reqs.push(await run(router.installations.create, { fullName, phoneNumber, physicalAddress }));
  }

  // Four go all the way to installation → clients
  const installed: any[] = [];
  for (const r of reqs.slice(0, 4)) {
    await run(router.installations.approve, { id: r.id, installationFeeKes: 12500 });
    await run(router.installations.markPaid, { id: r.id });
    installed.push(((await run(router.installations.markInstalled, { id: r.id })) as any).client);
  }
  await run(router.installations.approve, { id: reqs[4].id, installationFeeKes: 15000 });

  /**
   * Six months of billing history (Apr–Sep 2026). Amounts are units × KES 150.
   * Wanjiru's August and September invoices are issued first so they keep the
   * demo identifiers INV-00001 (paid) and INV-00002 (the overdue KES 1,560 bill).
   */
  const periods = [
    { start: "2026-04-01", end: "2026-04-30", due: "2026-05-15", units: [17.2, 20.5, 7.5, 26.4] },
    { start: "2026-05-01", end: "2026-05-31", due: "2026-06-15", units: [19.6, 23.1, 8.8, 29.8] },
    { start: "2026-06-01", end: "2026-06-30", due: "2026-07-15", units: [16.8, 18.9, 6.9, 27.3] },
    { start: "2026-07-01", end: "2026-07-31", due: "2026-08-15", units: [21.4, 24.2, 10.1, 30.5] },
    { start: "2026-08-01", end: "2026-08-31", due: "2026-09-15", units: [15.4, 19.75, 6.2, 28.05] },
    { start: "2026-09-01", end: "2026-09-30", due: "2026-10-20", units: [18.4, 22.75, 9.2, 31.05] },
  ] as const;

  const rows: any[][] = installed.map(() => []);
  const createInvoice = (clientIndex: number, periodIndex: number) => {
    const period = periods[periodIndex];
    return run<any>(router.invoices.create, {
      clientId: installed[clientIndex].id,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      consumptionUnits: period.units[clientIndex],
      dueDate: period.due,
    });
  };

  rows[0][4] = await createInvoice(0, 4);
  rows[0][5] = await createInvoice(0, 5);
  for (const periodIndex of [0, 1, 2, 3]) rows[0][periodIndex] = await createInvoice(0, periodIndex);
  for (let clientIndex = 1; clientIndex < installed.length; clientIndex++) {
    for (let periodIndex = 0; periodIndex < periods.length; periodIndex++) {
      rows[clientIndex][periodIndex] = await createInvoice(clientIndex, periodIndex);
    }
  }
  const invs = rows.flat();

  // Apr–Jul are settled in full for every client, giving the usage chart real history.
  let receiptSeq = 0;
  const nextReceipt = () => `QA${String(++receiptSeq).padStart(8, "0")}`;
  for (const [clientIndex, client] of installed.entries()) {
    for (const periodIndex of [0, 1, 2, 3]) {
      const invoice = rows[clientIndex][periodIndex];
      await run(router.payments.record, {
        clientId: client.id,
        invoiceId: invoice.id,
        paymentChannel: "MPESA_PAYBILL",
        mpesaReceiptNumber: nextReceipt(),
        amountPaidKes: invoice.amountDueKes,
      });
    }
  }

  // Current month mix: August paid in full for three clients and partial for one.
  await run(router.payments.record, { clientId: installed[0].id, invoiceId: rows[0][4].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: "QX891234AB", amountPaidKes: rows[0][4].amountDueKes });
  await run(router.payments.record, { clientId: installed[1].id, invoiceId: rows[1][4].id, paymentChannel: "MPESA_STK_PUSH", mpesaReceiptNumber: "QX772910CD", amountPaidKes: rows[1][4].amountDueKes });
  await run(router.payments.record, { clientId: installed[2].id, invoiceId: rows[2][4].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: "QY104455EF", amountPaidKes: 500 });
  await run(router.payments.record, { clientId: installed[3].id, invoiceId: rows[3][4].id, paymentChannel: "BANK_TRANSFER", amountPaidKes: rows[3][4].amountDueKes });

  // Wanjiru's overdue September bill: KES 2,760 due, KES 1,200 paid → KES 1,560.
  await run(router.payments.record, { clientId: installed[0].id, invoiceId: rows[0][5].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: "QZ551200JK", amountPaidKes: 1200 });

  await createLogin({ name: "David Njoroge", email: "admin@mwandiwaters.co.ke", role: "admin", phoneNumber: "+254700000002" });
  await createLogin({ name: "Faith Achieng", email: "staff@mwandiwaters.co.ke", role: "staff", phoneNumber: "+254700000003" });
  await createLogin({ name: installed[0].fullName, email: "wanjiru@example.co.ke", role: "client", phoneNumber: installed[0].phoneNumber, clientId: installed[0].id });

  const { updated } = await run<{ updated: number }>(router.invoices.markOverdue);
  console.log(`Seeded ${reqs.length} requests, ${installed.length} clients, ${invs.length} invoices; ${updated} overdue.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
