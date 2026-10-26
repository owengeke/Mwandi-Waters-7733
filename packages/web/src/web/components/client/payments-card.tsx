import { Wallet } from "lucide-react";
import type { Invoice, Payment } from "../../../api/database/schema";
import { channelLabel, formatDate, formatKES } from "../../lib/format";
import { EmptyState, LoadingRows, Panel } from "./section";
import { ReceiptButton } from "./receipt-button";

export function PaymentsCard({
  payments,
  invoices,
  loading,
  error,
}: {
  payments: Payment[];
  invoices: Invoice[];
  loading: boolean;
  error?: unknown;
}) {
  if (error) {
    return (
      <Panel>
        <div role="alert" className="px-5 py-10 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load your payments."}
        </div>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel>
        <LoadingRows rows={3} />
      </Panel>
    );
  }

  if (payments.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="No payments yet"
          description="Once you pay a bill, the receipt and a downloadable PDF will appear here."
        />
      </Panel>
    );
  }

  const invoiceNumber = (id: number | null) => invoices.find((invoice) => invoice.id === id)?.invoiceNumber;

  return (
    <Panel>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 text-left">Receipt</th>
              <th scope="col" className="px-3 py-2.5 text-left">Date</th>
              <th scope="col" className="px-3 py-2.5 text-left">Channel</th>
              <th scope="col" className="px-3 py-2.5 text-left">Bill</th>
              <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
              <th scope="col" className="px-5 py-2.5 text-right">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map((payment) => (
              <tr key={payment.id} className="transition-colors hover:bg-accent/30">
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold">{payment.mpesaReceiptNumber ?? `PMT-${payment.id}`}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{formatDate(payment.paymentDate)}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{channelLabel(payment.paymentChannel)}</td>
                <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-muted-foreground">
                  {invoiceNumber(payment.invoiceId) ?? "Account"}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">
                  {formatKES(payment.amountPaidKes)}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <ReceiptButton paymentId={payment.id} receipt={payment.mpesaReceiptNumber} mode="open" />
                    <ReceiptButton paymentId={payment.id} receipt={payment.mpesaReceiptNumber} mode="download" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y md:hidden">
        {payments.map((payment) => (
          <li key={payment.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold">{payment.mpesaReceiptNumber ?? `PMT-${payment.id}`}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(payment.paymentDate)} · {channelLabel(payment.paymentChannel)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">{formatKES(payment.amountPaidKes)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {invoiceNumber(payment.invoiceId) ?? "Account payment"}
              </span>
              <div className="flex items-center gap-1.5">
                <ReceiptButton paymentId={payment.id} receipt={payment.mpesaReceiptNumber} mode="open" />
                <ReceiptButton paymentId={payment.id} receipt={payment.mpesaReceiptNumber} mode="download" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
