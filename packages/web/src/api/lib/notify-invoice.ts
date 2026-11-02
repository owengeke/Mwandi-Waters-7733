/**
 * Invoice-issued notice.
 *
 * The message keeps the existing bill details and adds the previous reading:
 *   "Previous: 18 units, now 21 units (+3)."
 *
 * Delivery never blocks issuing an invoice: without WhatsApp credentials (or
 * without an approved invoice template) the message is logged for the demo and
 * the procedure still succeeds.
 */
import { sendWhatsAppInvoice, whatsappInvoiceConfigured } from "./whatsapp";

export interface InvoiceNoticeInput {
  client: { fullName: string; phoneNumber: string };
  invoice: {
    invoiceNumber: string;
    consumptionUnits: number;
    amountDueKes: number | null;
    dueDate: string;
  };
  periodLabel: string;
  previousUnits: number | null;
}

export interface InvoiceNoticeResult {
  sent: boolean;
  channel: "whatsapp" | "log";
  message: string;
}

const unitsText = (units: number) =>
  new Intl.NumberFormat("en-KE", { maximumFractionDigits: 3 }).format(units);

const kesText = (amount: number) =>
  new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "there";

/** "Previous: 18 units, now 21 units (+3)." — or "" when there is no earlier reading. */
export function previousReadingLine(previousUnits: number | null, units: number): string {
  if (previousUnits === null) return "";
  const change = Math.round((units - previousUnits) * 100) / 100;
  const sign = change > 0 ? "+" : "";
  return `Previous: ${unitsText(previousUnits)} units, now ${unitsText(units)} units (${sign}${unitsText(change)}).`;
}

export function composeInvoiceMessage(input: InvoiceNoticeInput): string {
  const units = Number(input.invoice.consumptionUnits);
  const amount = Number(input.invoice.amountDueKes ?? 0);
  const previous = previousReadingLine(input.previousUnits, units);

  return [
    `Habari ${firstName(input.client.fullName)}, your water bill ${input.invoice.invoiceNumber}`,
    `for ${input.periodLabel} is ready: ${unitsText(units)} units, KES ${kesText(amount)}`,
    `due ${input.invoice.dueDate}.`,
    previous,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function notifyInvoiceIssued(input: InvoiceNoticeInput): Promise<InvoiceNoticeResult> {
  const message = composeInvoiceMessage(input);

  if (!whatsappInvoiceConfigured()) {
    console.log(`[invoice-notice] (demo mode) ${message}`);
    return { sent: false, channel: "log", message };
  }

  try {
    await sendWhatsAppInvoice(input.client.phoneNumber, [
      firstName(input.client.fullName),
      input.invoice.invoiceNumber,
      input.periodLabel,
      unitsText(Number(input.invoice.consumptionUnits)),
      kesText(Number(input.invoice.amountDueKes ?? 0)),
      previousReadingLine(input.previousUnits, Number(input.invoice.consumptionUnits)) || "First reading.",
    ]);
    return { sent: true, channel: "whatsapp", message };
  } catch (error) {
    // Delivery problems must never fail the invoice that was already committed.
    console.error("[invoice-notice] WhatsApp delivery failed", error);
    return { sent: false, channel: "log", message };
  }
}
