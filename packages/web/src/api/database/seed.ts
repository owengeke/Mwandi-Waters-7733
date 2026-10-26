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

  const usage = [18.4, 22.75, 9.2, 31.05];
  const invs: any[] = [];
  for (const [i, c] of installed.entries()) {
    invs.push(
      await run(router.invoices.create, {
        clientId: c.id,
        billingPeriodStart: "2026-08-01",
        billingPeriodEnd: "2026-08-31",
        consumptionUnits: Math.round((usage[i] - 3) * 100) / 100,
        dueDate: "2026-09-15",
      }),
    );
    invs.push(
      await run(router.invoices.create, {
        clientId: c.id,
        billingPeriodStart: "2026-09-01",
        billingPeriodEnd: "2026-09-30",
        consumptionUnits: usage[i],
        dueDate: "2026-10-20",
      }),
    );
  }

  // August paid in full for 3 clients, partial for one
  const receipts = ["QX891234AB", "QX772910CD", "QY104455EF", "QY208833GH", "QZ551200JK"];
  await run(router.payments.record, { clientId: installed[0].id, invoiceId: invs[0].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: receipts[0], amountPaidKes: invs[0].amountDueKes });
  await run(router.payments.record, { clientId: installed[1].id, invoiceId: invs[2].id, paymentChannel: "MPESA_STK_PUSH", mpesaReceiptNumber: receipts[1], amountPaidKes: invs[2].amountDueKes });
  await run(router.payments.record, { clientId: installed[2].id, invoiceId: invs[4].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: receipts[2], amountPaidKes: 500 });
  await run(router.payments.record, { clientId: installed[3].id, invoiceId: invs[6].id, paymentChannel: "BANK_TRANSFER", amountPaidKes: invs[6].amountDueKes });
  await run(router.payments.record, { clientId: installed[0].id, invoiceId: invs[1].id, paymentChannel: "MPESA_PAYBILL", mpesaReceiptNumber: receipts[4], amountPaidKes: 1200 });

  await createLogin({ name: "David Njoroge", email: "admin@mwandiwaters.co.ke", role: "admin", phoneNumber: "+254700000002" });
  await createLogin({ name: "Faith Achieng", email: "staff@mwandiwaters.co.ke", role: "staff", phoneNumber: "+254700000003" });
  await createLogin({ name: installed[0].fullName, email: "wanjiru@example.co.ke", role: "client", phoneNumber: installed[0].phoneNumber, clientId: installed[0].id });

  const { updated } = await run<{ updated: number }>(router.invoices.markOverdue);
  console.log(`Seeded ${reqs.length} requests, ${installed.length} clients, ${invs.length} invoices; ${updated} overdue.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
