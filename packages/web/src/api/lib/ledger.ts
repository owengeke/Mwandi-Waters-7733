import { eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { clients, invoices, payments, type PaymentChannel } from "../database/schema";
import { addKes, subKes, roundKes, toCents, fromCents } from "./money";
import { deriveInvoiceStatus } from "./billing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PostPaymentInput {
  clientId: number;
  invoiceId?: number;
  mpesaReceiptNumber?: string;
  paymentChannel: PaymentChannel;
  amountPaidKes: number;
  paymentDate?: Date;
}

/**
 * Posts a payment atomically:
 *  1. inserts the payment row (unique M-Pesa receipt guards against double posting)
 *  2. applies up to the outstanding amount to the invoice and re-derives its status
 *  3. reduces the client's running balance by the full amount (overpayment → credit)
 */
export async function postPayment(input: PostPaymentInput) {
  return db.transaction((tx) => postPaymentTx(tx, input));
}

/**
 * Transaction-aware variant used by the M-Pesa callback, which must update the
 * pending transaction row and post the ledger entry in the same commit.
 */
export async function postPaymentTx(tx: Tx, input: PostPaymentInput) {
  const amount = roundKes(input.amountPaidKes);
  const isMpesa = input.paymentChannel.startsWith("MPESA");
  if (isMpesa && !input.mpesaReceiptNumber) {
    throw new ORPCError("BAD_REQUEST", { message: "M-Pesa payments require a receipt number" });
  }

  const [client] = await tx.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) throw new ORPCError("NOT_FOUND", { message: "Client not found" });

  if (input.mpesaReceiptNumber) {
    const [dupe] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.mpesaReceiptNumber, input.mpesaReceiptNumber));
    if (dupe) throw new ORPCError("CONFLICT", { message: `Receipt ${input.mpesaReceiptNumber} already posted` });
  }

  let invoice = null;
  if (input.invoiceId) {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!inv || inv.clientId !== client.id) {
      throw new ORPCError("BAD_REQUEST", { message: "Invoice does not belong to this client" });
    }
    invoice = await applyToInvoice(tx, inv.id, amount);
  }

  const [payment] = await tx
    .insert(payments)
    .values({
      clientId: client.id,
      invoiceId: input.invoiceId ?? null,
      mpesaReceiptNumber: input.mpesaReceiptNumber ?? null,
      paymentChannel: input.paymentChannel,
      amountPaidKes: amount,
      paymentDate: input.paymentDate ?? new Date(),
    })
    .returning();

  const [updatedClient] = await tx
    .update(clients)
    .set({ currentBalanceKes: subKes(client.currentBalanceKes, amount) })
    .where(eq(clients.id, client.id))
    .returning();

  return { payment, invoice, client: updatedClient };
}

async function applyToInvoice(tx: Tx, invoiceId: number, amount: number) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  const due = inv.amountDueKes ?? 0;
  const outstanding = Math.max(0, toCents(due) - toCents(inv.amountPaidKes));
  const applied = fromCents(Math.min(outstanding, toCents(amount)));
  const newPaid = addKes(inv.amountPaidKes, applied);
  const [updated] = await tx
    .update(invoices)
    .set({ amountPaidKes: newPaid, status: deriveInvoiceStatus(due, newPaid, inv.dueDate) })
    .where(eq(invoices.id, invoiceId))
    .returning();
  return updated;
}

/** Adds a freshly issued invoice's amount to the client's balance. */
export async function chargeClient(tx: Tx, clientId: number, amountKes: number) {
  await tx
    .update(clients)
    .set({ currentBalanceKes: sql`round(${clients.currentBalanceKes} + ${amountKes}, 2)` })
    .where(eq(clients.id, clientId));
}
