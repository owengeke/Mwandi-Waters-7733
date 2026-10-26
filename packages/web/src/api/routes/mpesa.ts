import type { Context } from "hono";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import { clients, invoices, mpesaTransactions, payments } from "../database/schema";
import { OPERATOR_ROLES, isRole, type Role } from "../lib/roles";
import { postPaymentTx } from "../lib/ledger";
import { renderReceiptPdf } from "../lib/receipt";

/**
 * Safaricom callback payloads are loosely typed — accept both numeric and
 * string result codes, then normalise. Anything unrecognised is acknowledged
 * with 200 so Safaricom does not retry forever.
 */
const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().optional(),
      CheckoutRequestID: z.string().min(1),
      ResultCode: z.union([z.number(), z.string()]),
      ResultDesc: z.string().optional(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});

const ack = (c: Context) => c.json({ ResultCode: 0, ResultDesc: "Accepted" });

/**
 * POST /api/mpesa/callback — public endpoint called by Safaricom.
 *
 * Idempotency: a request is only processed while it is PENDING (or after our
 * local timeout, so a late success can still be reconciled). The status flip
 * and the ledger write happen in one transaction, and the M-Pesa receipt is
 * unique in `payments`, so a replayed callback can never double-post.
 */
export async function mpesaCallback(c: Context) {
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return c.json({ ResultCode: 1, ResultDesc: "Invalid body" }, 400);
  }

  let parsed: z.infer<typeof callbackSchema>;
  try {
    parsed = callbackSchema.parse(JSON.parse(raw));
  } catch {
    return c.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, 400);
  }

  const cb = parsed.Body.stkCallback;
  const [trx] = await db
    .select()
    .from(mpesaTransactions)
    .where(eq(mpesaTransactions.checkoutRequestId, cb.CheckoutRequestID));

  // Unknown checkout id — acknowledge; nothing to reconcile.
  if (!trx) return ack(c);
  // SUCCESS / FAILED / CANCELLED are immutable.
  if (trx.status === "SUCCESS" || trx.status === "FAILED" || trx.status === "CANCELLED") return ack(c);

  const resultCode = Number(cb.ResultCode);
  const meta = new Map((cb.CallbackMetadata?.Item ?? []).map((item) => [item.Name, item.Value]));

  if (resultCode !== 0) {
    const status = resultCode === 1032 ? "CANCELLED" : "FAILED";
    await db
      .update(mpesaTransactions)
      .set({
        status,
        resultCode: String(resultCode),
        resultDescription: cb.ResultDesc ?? "Payment was not completed",
        rawCallback: raw,
      })
      .where(and(eq(mpesaTransactions.id, trx.id), eq(mpesaTransactions.status, "PENDING")));
    return ack(c);
  }

  const receipt = typeof meta.get("MpesaReceiptNumber") === "string" ? String(meta.get("MpesaReceiptNumber")) : null;
  const paidAmount = Number(meta.get("Amount"));
  const amountMatches = Number.isFinite(paidAmount) && Math.round(paidAmount * 100) === Math.round(trx.amountKes * 100);

  if (!receipt || !amountMatches) {
    await db
      .update(mpesaTransactions)
      .set({
        status: "FAILED",
        resultCode: String(resultCode),
        resultDescription: !receipt ? "Callback did not include an M-Pesa receipt" : "Callback amount did not match the payment request",
        rawCallback: raw,
      })
      .where(and(eq(mpesaTransactions.id, trx.id), eq(mpesaTransactions.status, "PENDING")));
    return ack(c);
  }

  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(mpesaTransactions).where(eq(mpesaTransactions.id, trx.id));
      if (!current || current.status === "SUCCESS" || current.status === "FAILED" || current.status === "CANCELLED") return;

      const [updated] = await tx
        .update(mpesaTransactions)
        .set({
          status: "SUCCESS",
          resultCode: "0",
          resultDescription: cb.ResultDesc ?? "Payment completed",
          mpesaReceiptNumber: receipt,
          rawCallback: raw,
        })
        .where(and(eq(mpesaTransactions.id, trx.id), inArray(mpesaTransactions.status, ["PENDING", "TIMED_OUT"])))
        .returning();
      if (!updated) return;

      // Someone may have reconciled the same receipt manually — never double-post.
      const [existing] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.mpesaReceiptNumber, receipt));
      if (existing) return;

      await postPaymentTx(tx, {
        clientId: trx.clientId,
        invoiceId: trx.invoiceId ?? undefined,
        mpesaReceiptNumber: receipt,
        paymentChannel: "MPESA_STK_PUSH",
        amountPaidKes: trx.amountKes,
      });
    });
  } catch (error) {
    console.error("[mpesa:callback] could not post payment", error);
    // Rolled back — leave the request PENDING so Safaricom's retry can succeed.
    return c.json({ ResultCode: 1, ResultDesc: "Temporary processing error" }, 500);
  }

  return ack(c);
}

const CHANNEL_LABELS: Record<string, string> = {
  MPESA_PAYBILL: "M-Pesa Paybill",
  MPESA_STK_PUSH: "M-Pesa STK Push",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
};

/**
 * GET /api/receipts/:paymentId.pdf — PDF receipt (the extension is optional).
 * Clients may only download their own receipts; operators may download any.
 */
export async function receiptPdf(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Sign in required" }, 401);

  const paymentId = Number((c.req.param("paymentId") ?? "").replace(/\.pdf$/i, ""));
  if (!Number.isInteger(paymentId) || paymentId <= 0) return c.json({ error: "Receipt not found" }, 404);

  const [row] = await db
    .select({ payment: payments, client: clients, invoice: invoices })
    .from(payments)
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(eq(payments.id, paymentId));
  if (!row) return c.json({ error: "Receipt not found" }, 404);

  const role: Role = isRole(session.user.role) ? session.user.role : "client";
  const isOperator = OPERATOR_ROLES.includes(role);
  const ownsReceipt = role === "client" && Number(session.user.clientId) === row.payment.clientId;
  if (!isOperator && !ownsReceipt) return c.json({ error: "Not permitted" }, 403);

  const [trx] = row.payment.mpesaReceiptNumber
    ? await db
        .select({ isDemo: mpesaTransactions.isDemo })
        .from(mpesaTransactions)
        .where(eq(mpesaTransactions.mpesaReceiptNumber, row.payment.mpesaReceiptNumber))
        .limit(1)
    : [];

  const pdf = await renderReceiptPdf({
    paymentId: row.payment.id,
    receiptNumber: row.payment.mpesaReceiptNumber ?? `PMT-${String(row.payment.id).padStart(5, "0")}`,
    mpesaReference: row.payment.mpesaReceiptNumber,
    amountKes: row.payment.amountPaidKes,
    paidAt: row.payment.paymentDate,
    channelLabel: CHANNEL_LABELS[row.payment.paymentChannel] ?? row.payment.paymentChannel,
    accountNumber: row.client.accountNumber,
    meterNumber: row.client.meterNumber,
    customerName: row.client.fullName,
    phoneNumber: row.client.phoneNumber,
    invoiceNumber: row.invoice?.invoiceNumber ?? null,
    isDemo: Boolean(trx?.isDemo),
  });

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="mwandi-receipt-${row.payment.mpesaReceiptNumber ?? row.payment.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
