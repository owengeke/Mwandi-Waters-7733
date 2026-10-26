import { ArrowRight, CalendarClock, CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import type { Client, Invoice } from "../../../api/database/schema";
import { formatDate, formatKES } from "../../lib/format";
import { outstandingKes } from "../../queries/account";
import { cn } from "../../lib/utils";
import { Skeleton } from "./section";

export function BalanceCard({
  client,
  invoices,
  loading,
  onPay,
}: {
  client: Client | undefined;
  invoices: Invoice[];
  loading: boolean;
  onPay: (invoice: Invoice) => void;
}) {
  const balance = client?.currentBalanceKes ?? 0;
  const open = invoices
    .filter((invoice) => outstandingKes(invoice) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextInvoice = open[0];
  const overdue = open.some((invoice) => invoice.status === "OVERDUE");
  const settled = balance <= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-6 shadow-[0_1px_0_rgba(11,27,46,0.02)] md:p-7">
      <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden />
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full border-[22px] border-primary/[0.06]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-16 size-48 rounded-full border-[16px] border-primary/[0.04]"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {settled && balance < 0 ? "Credit on account" : "Outstanding balance"}
          </p>
          {loading ? (
            <Skeleton className="mt-3 h-10 w-56" />
          ) : (
            <p className="mt-2 font-display text-4xl font-bold tracking-tight tabular-nums md:text-[2.75rem]">
              {formatKES(Math.abs(balance))}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {loading ? (
              <Skeleton className="h-4 w-48" />
            ) : settled ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="size-4" />
                You&rsquo;re all settled — thank you.
              </span>
            ) : (
              <>
                <span className={cn("inline-flex items-center gap-1.5 font-medium", overdue ? "text-destructive" : "text-foreground")}>
                  <CalendarClock className="size-4" />
                  {overdue ? "Payment overdue" : "Next due"} {nextInvoice ? formatDate(nextInvoice.dueDate) : "—"}
                </span>
                <span className="text-muted-foreground">
                  {open.length} open {open.length === 1 ? "bill" : "bills"}
                </span>
              </>
            )}
          </div>
        </div>

        <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
          <Wallet className="size-6" />
        </span>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => nextInvoice && onPay(nextInvoice)}
          disabled={!nextInvoice || loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pay {nextInvoice ? formatKES(outstandingKes(nextInvoice)) : "bill"}
          <ArrowRight className="size-4" />
        </button>
        <a
          href="#bills"
          className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted"
        >
          View bills
        </a>
        {overdue && (
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="size-3.5 text-primary" />
            Pay securely with M-Pesa
          </span>
        )}
      </div>
    </div>
  );
}

export function OpenInvoicesCard({
  invoices,
  loading,
  onPay,
}: {
  invoices: Invoice[];
  loading: boolean;
  onPay: (invoice: Invoice) => void;
}) {
  const open = invoices.filter((invoice) => outstandingKes(invoice) > 0);
  const total = open.reduce((sum, invoice) => sum + outstandingKes(invoice), 0);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-bold">Open invoices</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {open.length ? `${formatKES(total)} across ${open.length} ${open.length === 1 ? "bill" : "bills"}` : "Nothing waiting"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold tabular-nums text-muted-foreground">
          {open.length}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="mt-2.5 text-sm font-semibold">No open invoices</p>
          <p className="mt-1 text-xs text-muted-foreground">Your account is up to date.</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y">
          {open.slice(0, 3).map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{invoice.invoiceNumber}</span>
                  {invoice.status === "OVERDUE" && (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                      Overdue
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  Due {formatDate(invoice.dueDate)} · {invoice.consumptionUnits} units
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{formatKES(outstandingKes(invoice))}</span>
                <button
                  type="button"
                  onClick={() => onPay(invoice)}
                  className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5"
                >
                  Pay
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <a
        href="#bills"
        className="flex items-center justify-center gap-1.5 border-t px-5 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
      >
        View all bills
        <ArrowRight className="size-3.5" />
      </a>
    </div>
  );
}
