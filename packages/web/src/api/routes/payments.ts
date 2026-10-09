import { z } from "zod";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { operator } from "../middleware/auth";
import { db } from "../database";
import * as t from "../database/schema";
import { PAYMENT_CHANNELS } from "../database/schema";
import { mpesaReceipt, positiveKes, pagination } from "../lib/validators";
import { postPayment } from "../lib/ledger";

export const payments = {
  list: operator
    .input(
      pagination.extend({
        clientId: z.number().int().positive().optional(),
        channel: z.enum(PAYMENT_CHANNELS).optional(),
      }),
    )
    .handler(({ input }) => {
      const filters: SQL[] = [];
      if (input.clientId) filters.push(eq(t.payments.clientId, input.clientId));
      if (input.channel) filters.push(eq(t.payments.paymentChannel, input.channel));
      return db
        .select({
          payment: t.payments,
          client: { id: t.clients.id, accountNumber: t.clients.accountNumber, fullName: t.clients.fullName },
        })
        .from(t.payments)
        .innerJoin(t.clients, eq(t.clients.id, t.payments.clientId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(t.payments.paymentDate))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getByReceipt: operator.input(z.object({ receipt: mpesaReceipt })).handler(async ({ input }) => {
    const [row] = await db.select().from(t.payments).where(eq(t.payments.mpesaReceiptNumber, input.receipt));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Receipt not found" });
    return row;
  }),

  /** Manual posting (cashier / reconciliation). M-Pesa callbacks should reuse lib/ledger.postPayment. */
  record: operator
    .input(
      z.object({
        clientId: z.number().int().positive(),
        invoiceId: z.number().int().positive().optional(),
        mpesaReceiptNumber: mpesaReceipt.optional(),
        paymentChannel: z.enum(PAYMENT_CHANNELS),
        amountPaidKes: positiveKes,
        paymentDate: z.coerce.date().optional(),
      }),
    )
    .handler(({ input }) => postPayment(input)),
};
