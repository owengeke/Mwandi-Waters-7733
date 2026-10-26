import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { clientOnly } from "../middleware/auth";
import { db } from "../database";
import { clients, invoices, payments, mpesaTransactions } from "../database/schema";
import { positiveKes } from "../lib/validators";
import { kenyanPhone } from "../lib/validators";
import { postPaymentTx } from "../lib/ledger";
import { demoCheckoutId, demoReceipt, outstandingKes, stkAmount } from "../lib/mpesa";
import { mpesaConfig, mpesaConfigured, stkPush } from "../lib/daraja";

const PAYMENT_TIMEOUT_MS = 120_000;

const payInput = z.object({
  invoiceId: z.number().int().positive(),
  phone: kenyanPhone,
  amountKes: positiveKes.int(),
});

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
    return {
      client,
      invoices: inv,
      payments: pay,
      mpesa: {
        demoMode: !mpesaConfigured(),
        paybill: mpesaConfig().paybillDisplay,
      },
    };
  }),

  /**
   * Starts an M-Pesa STK Push for one invoice. The amount may be a partial
   * payment but can never exceed the outstanding balance. Without Daraja
   * credentials this simulates a successful payment (demo mode) so the whole
   * flow remains demonstrable.
   */
  payMpesa: clientOnly.input(payInput).handler(async ({ input, context }) => {
    const clientId = context.user.clientId;
    if (!clientId) throw new ORPCError("NOT_FOUND", { message: "No water account is linked to this login" });

    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) throw new ORPCError("NOT_FOUND", { message: "Account not found" });

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!invoice || invoice.clientId !== client.id) {
      throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
    }

    const outstanding = outstandingKes(invoice.amountDueKes ?? 0, invoice.amountPaidKes);
    if (outstanding <= 0) throw new ORPCError("CONFLICT", { message: "This invoice is already paid" });

    const maximum = stkAmount(outstanding);
    if (input.amountKes > maximum) {
      throw new ORPCError("BAD_REQUEST", { message: `Amount cannot exceed the outstanding balance of KES ${maximum.toLocaleString("en-KE")}` });
    }

    if (mpesaConfigured()) {
      let result;
      try {
        result = await stkPush({
          amountKes: input.amountKes,
          phoneNumber: input.phone,
          accountReference: client.accountNumber,
          description: `Water bill ${invoice.invoiceNumber}`,
        });
      } catch (e) {
        throw new ORPCError("BAD_GATEWAY", {
          message: e instanceof Error ? e.message : "Could not reach M-Pesa. Please try again.",
        });
      }

      await db.insert(mpesaTransactions).values({
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        clientId: client.id,
        invoiceId: invoice.id,
        phoneNumber: input.phone,
        amountKes: input.amountKes,
        status: "PENDING",
      });

      return {
        checkoutRequestId: result.checkoutRequestId,
        status: "PENDING" as const,
        demo: false,
        amountKes: input.amountKes,
        message: result.customerMessage,
      };
    }

    // Demo mode — Daraja credentials are absent. Record a real transaction row
    // (flagged) and post it through the same ledger path as a live callback.
    const checkoutRequestId = demoCheckoutId();
    const receipt = demoReceipt();
    const amountKes = input.amountKes;

    const posted = await db.transaction(async (tx) => {
      await tx.insert(mpesaTransactions).values({
        checkoutRequestId,
        clientId: client.id,
        invoiceId: invoice.id,
        phoneNumber: input.phone,
        amountKes,
        status: "SUCCESS",
        resultCode: "0",
        resultDescription: "Demo mode — simulated successful payment",
        mpesaReceiptNumber: receipt,
        isDemo: true,
      });
      return postPaymentTx(tx, {
        clientId: client.id,
        invoiceId: invoice.id,
        mpesaReceiptNumber: receipt,
        paymentChannel: "MPESA_STK_PUSH",
        amountPaidKes: amountKes,
      });
    });

    return {
      checkoutRequestId,
      status: "SUCCESS" as const,
      demo: true,
      amountKes,
      receipt,
      paymentId: posted.payment.id,
      message: "Demo payment completed.",
    };
  }),

  /** Polled by the payment dialog every few seconds. */
  paymentStatus: clientOnly
    .input(z.object({ checkoutRequestId: z.string().min(1).max(160) }))
    .handler(async ({ input, context }) => {
      const clientId = context.user.clientId;
      if (!clientId) throw new ORPCError("NOT_FOUND", { message: "No water account is linked to this login" });

      const [trx] = await db
        .select()
        .from(mpesaTransactions)
        .where(
          and(
            eq(mpesaTransactions.checkoutRequestId, input.checkoutRequestId),
            eq(mpesaTransactions.clientId, clientId),
          ),
        );
      if (!trx) throw new ORPCError("NOT_FOUND", { message: "Payment request not found" });

      let status = trx.status;
      if (status === "PENDING" && Date.now() - trx.createdAt.getTime() > PAYMENT_TIMEOUT_MS) {
        // No callback arrived — close the request lazily so no cron is needed.
        await db
          .update(mpesaTransactions)
          .set({
            status: "TIMED_OUT",
            resultDescription: "No response from M-Pesa. If you completed the payment, it will still be reconciled.",
          })
          .where(and(eq(mpesaTransactions.id, trx.id), eq(mpesaTransactions.status, "PENDING")));
        status = "TIMED_OUT";
      }

      let paymentId: number | null = null;
      if (trx.mpesaReceiptNumber) {
        const [payment] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.mpesaReceiptNumber, trx.mpesaReceiptNumber));
        paymentId = payment?.id ?? null;
      }

      return {
        status,
        demo: trx.isDemo,
        receipt: trx.mpesaReceiptNumber,
        paymentId,
        amountKes: trx.amountKes,
        message: trx.resultDescription,
      };
    }),
};
