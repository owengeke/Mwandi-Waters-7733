import type { InvoiceStatus } from "../database/schema";
import { toCents } from "./money";

/** Flat tariff — mirrors the generated column in schema.ts (invoices.amount_due_kes). */
export const TARIFF_PER_UNIT_KES = 150;

export const calcAmountDue = (units: number) => Math.round(units * TARIFF_PER_UNIT_KES * 100) / 100;

/** Derive invoice status from amounts and due date (YYYY-MM-DD). */
export function deriveInvoiceStatus(amountDue: number, amountPaid: number, dueDate: string, today = todayISO()): InvoiceStatus {
  const due = toCents(amountDue);
  const paid = toCents(amountPaid);
  if (paid >= due) return "PAID";
  if (dueDate < today) return "OVERDUE";
  return paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
