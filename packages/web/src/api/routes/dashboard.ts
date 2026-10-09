import { sql, eq, inArray } from "drizzle-orm";
import { operator } from "../middleware/auth";
import { db } from "../database";
import { clients, invoices, payments, installationRequests } from "../database/schema";

export const dashboard = {
  summary: operator.handler(async () => {
    const [clientStats, invoiceStats, paymentStats, pendingRequests] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${clients.status} = 'ACTIVE' then 1 else 0 end)`,
          outstandingKes: sql<number>`coalesce(round(sum(case when ${clients.currentBalanceKes} > 0 then ${clients.currentBalanceKes} else 0 end), 2), 0)`,
        })
        .from(clients),
      db
        .select({
          overdue: sql<number>`count(*)`,
          overdueKes: sql<number>`coalesce(round(sum(${invoices.amountDueKes} - ${invoices.amountPaidKes}), 2), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.status, "OVERDUE")),
      db
        .select({
          count: sql<number>`count(*)`,
          totalKes: sql<number>`coalesce(round(sum(${payments.amountPaidKes}), 2), 0)`,
        })
        .from(payments)
        .where(sql`${payments.paymentDate} >= unixepoch('now', 'start of month')`),
      db
        .select({ count: sql<number>`count(*)` })
        .from(installationRequests)
        .where(inArray(installationRequests.status, ["PENDING_REVIEW", "APPROVED_PENDING_PAYMENT", "PAID"])),
    ]);
    return {
      clients: { total: Number(clientStats[0].total), active: Number(clientStats[0].active ?? 0) },
      outstandingKes: Number(clientStats[0].outstandingKes),
      overdue: { count: Number(invoiceStats[0].overdue), amountKes: Number(invoiceStats[0].overdueKes) },
      collectionsThisMonth: { count: Number(paymentStats[0].count), amountKes: Number(paymentStats[0].totalKes) },
      openInstallationRequests: Number(pendingRequests[0].count),
    };
  }),
};
