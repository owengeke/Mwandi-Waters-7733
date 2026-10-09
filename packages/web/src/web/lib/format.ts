const kesFmt = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitsFmt = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 3 });
const dateFmt = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" });

export const formatKES = (v: number | null | undefined) => `KES ${kesFmt.format(v ?? 0)}`;
export const formatUnits = (v: number) => unitsFmt.format(v);

export function formatDate(v: Date | string | number) {
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return dateFmt.format(d);
}

/** +254712345678 → +254 712 345 678 */
export const formatPhone = (p: string) => p.replace(/^\+254(\d{3})(\d{3})(\d{3})$/, "+254 $1 $2 $3");

export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const CHANNEL_LABELS: Record<string, string> = {
  MPESA_PAYBILL: "M-Pesa Paybill",
  MPESA_STK_PUSH: "M-Pesa STK Push",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
};
export const channelLabel = (c: string) => CHANNEL_LABELS[c] ?? humanize(c);
