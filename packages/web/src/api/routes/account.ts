import { desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { clientOnly } from "../middleware/auth";
import { db } from "../database";
import { clients, invoices, payments } from "../database/schema";

/** Self-service for signed-in clients — always scoped to context.user.clientId. */
export const account = {
  overview: clientOnly.handler(async ({ context }) => {
    const clientId = context.user.clientId;
    if (!clientId) throw new ORPCError("NOT_FOUND", { message: "No water account is linked to this login" });
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) throw new ORPCError("NOT_FOUND", { message: "Account not found" });
    const [inv, pay] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.billingPeriodEnd)).limit(12),
      db.select().from(payments).where(eq(payments.clientId, clientId)).orderBy(desc(payments.paymentDate)).limit(12),
    ]);
    return { client, invoices: inv, payments: pay };
  }),
};
