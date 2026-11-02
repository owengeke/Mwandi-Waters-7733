/**
 * Invoice-issued notice.
 *
 * The message keeps the existing bill details and adds the meter readings that
 * produced the bill:
 *   "Previous reading 15; current reading 32; 17 units used."
 *
 * Delivery never blocks issuing an invoice: without WhatsApp credentials (or
 * without an approved invoice template) the message is logged for the demo and
 * the procedure still succeeds.
 */
import { formatReading, formatReadingDate } from "./meter-readings";
import { sendWhatsAppInvoice, whatsappInvoiceConfigured } from "./whatsapp";

export interface InvoiceNoticeInput {
  client: { fullName: string; phoneNumber: string };
  invoice: {
    invoiceNumber: string;
    consumptionUnits: number;
    amountDueKes: number | null;
    dueDate: string;
  };
  /** Date the reading was taken, YYYY-MM-DD. */
  readingDate: string;
  previousReading: number | null;
  currentReading: number;
}

export interface InvoiceNoticeResult {
  sent: boolean;
  channel: "whatsapp" | "log";
  message: string;
}

const kesText = (amount: number) =>
  new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "there";

/** "Previous reading 15; current reading 32; 17 units used." */
export function readingsLine(previousReading: number | null, currentReading: number, units: number): string {
  const previous =
    previousReading === null ? "First reading" : `Previous reading ${formatReading(previousReading)}`;
  return `${previous}; current reading ${formatReading(currentReading)}; ${formatReading(units)} units used.`;
}

export function composeInvoiceMessage(input: InvoiceNoticeInput): string {
  const units = Number(input.invoice.consumptionUnits);
  const amount = Number(input.invoice.amountDueKes ?? 0);

  return [
    `Habari ${firstName(input.client.fullName)}, your water bill ${input.invoice.invoiceNumber}`,
    `for ${formatReadingDate(input.readingDate)} is ready: ${formatReading(units)} units, KES ${kesText(amount)}`,
    `due ${input.invoice.dueDate}.`,
    readingsLine(input.previousReading, input.currentReading, units),
  ]
    .filter(Boolean)
    .join(" ");
}

export async function notifyInvoiceIssued(input: InvoiceNoticeInput): Promise<InvoiceNoticeResult> {
  const message = composeInvoiceMessage(input);
  const units = Number(input.invoice.consumptionUnits);

  if (!whatsappInvoiceConfigured()) {
    console.log(`[invoice-notice] (demo mode) ${message}`);
    return { sent: false, channel: "log", message };
  }

  try {
    await sendWhatsAppInvoice(input.client.phoneNumber, [
      firstName(input.client.fullName),
      input.invoice.invoiceNumber,
      formatReadingDate(input.readingDate),
      input.previousReading === null ? "First reading" : formatReading(input.previousReading),
      formatReading(input.currentReading),
      formatReading(units),
      kesText(Number(input.invoice.amountDueKes ?? 0)),
      input.invoice.dueDate,
    ]);
    return { sent: true, channel: "whatsapp", message };
  } catch (error) {
    // Delivery problems must never fail the invoice that was already committed.
    console.error("[invoice-notice] WhatsApp delivery failed", error);
    return { sent: false, channel: "log", message };
  }
}
