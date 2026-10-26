import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ReceiptPdfInput {
  paymentId: number;
  receiptNumber: string;
  mpesaReference: string | null;
  amountKes: number;
  paidAt: Date;
  channelLabel: string;
  accountNumber: string;
  meterNumber: string;
  customerName: string;
  phoneNumber: string;
  invoiceNumber: string | null;
  isDemo: boolean;
}

const KES = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("en-KE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Nairobi",
});

const BRAND = rgb(0.0, 0.466, 0.714);
const INK = rgb(0.043, 0.106, 0.18);
const MUTED = rgb(0.357, 0.42, 0.498);
const LINE = rgb(0.86, 0.9, 0.94);
const PAPER = rgb(0.98, 0.988, 1);

/** A one-page A4 PDF receipt, generated server-side with pdf-lib. */
export async function renderReceiptPdf(input: ReceiptPdfInput) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  // Header band
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: BRAND });
  page.drawText("Mwandi Waters", { x: 48, y: height - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Water utility · Nairobi, Kenya", { x: 48, y: height - 72, size: 10, font, color: rgb(0.85, 0.93, 1) });
  page.drawText("PAYMENT RECEIPT", { x: width - 48 - bold.widthOfTextAtSize("PAYMENT RECEIPT", 12), y: height - 52, size: 12, font: bold, color: rgb(1, 1, 1) });

  let y = height - 140;

  page.drawText(`Receipt ${input.receiptNumber}`, { x: 48, y, size: 18, font: bold, color: INK });
  y -= 22;
  page.drawText(`Issued ${DATE.format(input.paidAt)}`, { x: 48, y, size: 10, font, color: MUTED });
  if (input.isDemo) {
    const label = "DEMO MODE";
    const w = bold.widthOfTextAtSize(label, 9) + 16;
    page.drawRectangle({ x: width - 48 - w, y: y - 3, width: w, height: 18, color: rgb(1, 0.93, 0.8), borderColor: rgb(0.71, 0.33, 0.04), borderWidth: 0.7 });
    page.drawText(label, { x: width - 48 - w + 8, y: y + 2, size: 9, font: bold, color: rgb(0.71, 0.33, 0.04) });
  }

  // Amount panel
  y -= 34;
  page.drawRectangle({ x: 48, y: y - 74, width: width - 96, height: 74, color: PAPER, borderColor: LINE, borderWidth: 1 });
  page.drawText("Amount paid", { x: 64, y: y - 22, size: 9, font: bold, color: MUTED });
  page.drawText(`KES ${KES.format(input.amountKes)}`, { x: 64, y: y - 52, size: 24, font: bold, color: BRAND });
  page.drawText(input.channelLabel, { x: 64, y: y - 66, size: 9, font, color: MUTED });
  page.drawText(input.mpesaReference ?? "—", { x: width - 64 - mono.widthOfTextAtSize(input.mpesaReference ?? "—", 14), y: y - 46, size: 14, font: mono, color: INK });
  page.drawText("M-Pesa reference", { x: width - 64 - font.widthOfTextAtSize("M-Pesa reference", 9), y: y - 62, size: 9, font, color: MUTED });

  const rows: [string, string][] = [
    ["Account number", input.accountNumber],
    ["Meter number", input.meterNumber],
    ["Customer", input.customerName],
    ["Phone number", input.phoneNumber],
    ["Invoice", input.invoiceNumber ?? "Account payment"],
    ["Payment date", DATE.format(input.paidAt)],
  ];

  y -= 118;
  page.drawText("Payment details", { x: 48, y, size: 12, font: bold, color: INK });
  y -= 12;

  for (const [label, value] of rows) {
    page.drawLine({ start: { x: 48, y }, end: { x: width - 48, y }, thickness: 0.7, color: LINE });
    page.drawText(label, { x: 48, y: y - 18, size: 10, font, color: MUTED });
    const clipped = value.length > 48 ? `${value.slice(0, 47)}…` : value;
    page.drawText(clipped, { x: width - 48 - font.widthOfTextAtSize(clipped, 10), y: y - 18, size: 10, font: bold, color: INK });
    y -= 34;
  }
  page.drawLine({ start: { x: 48, y }, end: { x: width - 48, y }, thickness: 0.7, color: LINE });

  // Notes + footer
  y -= 36;
  page.drawText("This is an official receipt for a payment received by Mwandi Waters.", { x: 48, y, size: 9, font, color: MUTED });
  page.drawText("Keep it for your records. Payments are applied to the oldest outstanding bill on your account.", { x: 48, y: y - 14, size: 9, font, color: MUTED });

  page.drawLine({ start: { x: 48, y: 74 }, end: { x: width - 48, y: 74 }, thickness: 0.7, color: LINE });
  page.drawText("Mwandi Waters · Customer care · www.mwandiwaters.co.ke", { x: 48, y: 56, size: 8, font, color: MUTED });
  page.drawText(`Generated electronically · Payment #${input.paymentId}`, { x: 48, y: 44, size: 8, font, color: MUTED });

  return pdf.save();
}
