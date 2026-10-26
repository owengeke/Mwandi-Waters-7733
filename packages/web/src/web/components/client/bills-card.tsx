import { ReceiptText } from "lucide-react";
import type { Invoice } from "../../../api/database/schema";
import { formatDate, formatKES, formatUnits } from "../../lib/format";
import { outstandingKes } from "../../queries/account";
import { StatusBadge } from "../status-badge";
import { EmptyState, LoadingRows, Panel } from "./section";

function PayButton({ invoice, onPay }: { invoice: Invoice; onPay: (invoice: Invoice) => void }) {
  const outstanding = outstandingKes(invoice);
  if (outstanding <= 0) return <span className="text-xs text-muted-foreground">Settled</span>;
  return (
    <button
      type="button"
      onClick={() => onPay(invoice)}
      className="rounded-md border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      Pay
    </button>
  );
}

export function BillsCard({
  invoices,
  loading,
  error,
  onPay,
}: {
  invoices: Invoice[];
  loading: boolean;
  error?: unknown;
  onPay: (invoice: Invoice) => void;
}) {
  if (error) {
    return (
      <Panel>
        <div role="alert" className="px-5 py-10 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load your bills."}
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

  if (invoices.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<ReceiptText className="size-5" />}
          title="No bills yet"
          description="Your first statement will appear here after your meter is read."
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 text-left">Invoice</th>
              <th scope="col" className="px-3 py-2.5 text-right">Units</th>
              <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
              <th scope="col" className="px-3 py-2.5 text-right">Balance</th>
              <th scope="col" className="px-3 py-2.5 text-left">Due</th>
              <th scope="col" className="px-3 py-2.5 text-left">Status</th>
              <th scope="col" className="px-5 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="transition-colors hover:bg-accent/30">
                <td className="px-5 py-3.5">
                  <p className="font-mono text-xs font-semibold">{invoice.invoiceNumber}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                    {formatDate(invoice.billingPeriodStart)} – {formatDate(invoice.billingPeriodEnd)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-muted-foreground">
                  {formatUnits(invoice.consumptionUnits)}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">{formatKES(invoice.amountDueKes)}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums">
                  {formatKES(outstandingKes(invoice))}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{formatDate(invoice.dueDate)}</td>
                <td className="px-3 py-3.5">
                  <StatusBadge status={invoice.status} />
                </td>
                <td className="px-5 py-3.5 text-right">
                  <PayButton invoice={invoice} onPay={onPay} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y md:hidden">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold">{invoice.invoiceNumber}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(invoice.billingPeriodStart)} – {formatDate(invoice.billingPeriodEnd)}
                </p>
              </div>
              <StatusBadge status={invoice.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Units</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatUnits(invoice.consumptionUnits)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatKES(invoice.amountDueKes)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatKES(outstandingKes(invoice))}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">Due {formatDate(invoice.dueDate)}</span>
              <PayButton invoice={invoice} onPay={onPay} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
