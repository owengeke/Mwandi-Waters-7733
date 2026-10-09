import { useLocation } from "wouter";
import { Gauge, LogOut, ReceiptText, Wallet } from "lucide-react";
import { BrandMark } from "../components/app-shell";
import { ThemeToggle } from "../components/theme-switcher";
import { StatCard } from "../components/stat-card";
import { StatusBadge } from "../components/status-badge";
import { DataTable, type Column } from "../components/data-table";
import { Code } from "../components/code";
import { useAccountOverview } from "../queries/account";
import { useMe, useSignOut } from "../queries/portal";
import { channelLabel, formatDate, formatKES, formatUnits } from "../lib/format";

type Overview = NonNullable<ReturnType<typeof useAccountOverview>["data"]>;
type InvoiceRow = Overview["invoices"][number];
type PaymentRow = Overview["payments"][number];

const invoiceCols: Column<InvoiceRow>[] = [
  { key: "no", header: "Invoice", cell: (r) => <Code>{r.invoiceNumber}</Code> },
  { key: "period", header: "Period", cell: (r) => <span className="text-muted-foreground">{formatDate(r.billingPeriodStart)} – {formatDate(r.billingPeriodEnd)}</span> },
  { key: "units", header: "Units", align: "right", cell: (r) => <span className="tabular-nums">{formatUnits(r.consumptionUnits)}</span> },
  { key: "due", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.amountDueKes)}</span> },
  { key: "dueDate", header: "Due", cell: (r) => <span className="text-muted-foreground">{formatDate(r.dueDate)}</span> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
];

const paymentCols: Column<PaymentRow>[] = [
  { key: "receipt", header: "Receipt", cell: (r) => <Code>{r.mpesaReceiptNumber ?? "—"}</Code> },
  { key: "channel", header: "Channel", cell: (r) => <span className="text-muted-foreground">{channelLabel(r.paymentChannel)}</span> },
  { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground">{formatDate(r.paymentDate)}</span> },
  { key: "amt", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.amountPaidKes)}</span> },
];

export const Dashboard = function Dashboard() {
  const me = useMe();
  const overview = useAccountOverview();
  const signOut = useSignOut();
  const [, navigate] = useLocation();
  const c = overview.data?.client;
  const latest = overview.data?.invoices[0];
  const balance = c?.currentBalanceKes ?? 0;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <span className="font-display text-[17px] font-bold tracking-tight">Mwandi Waters</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-8 md:px-8 md:py-10">
        <header className="rise mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">My account</p>
          <h1 className="text-3xl font-bold">Habari, {(c?.fullName ?? me.data?.name ?? "").split(" ")[0]}</h1>
          {c && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>Account <Code className="text-primary">{c.accountNumber}</Code></span>
              <span>Meter <Code>{c.meterNumber}</Code></span>
              <StatusBadge status={c.status} />
            </p>
          )}
        </header>

        {overview.error ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{overview.error.message}</div>
        ) : (
          <>
            <section className="mb-10 grid gap-4 sm:grid-cols-3">
              <StatCard
                index={0}
                emphasis
                label={balance < 0 ? "Credit on account" : "Balance due"}
                icon={<Wallet className="size-4" />}
                loading={overview.isLoading}
                value={formatKES(Math.abs(balance))}
                caption={balance > 0 ? "Pay via M-Pesa Paybill 522 533" : "You're all settled"}
              />
              <StatCard
                index={1}
                label="Last bill"
                icon={<ReceiptText className="size-4" />}
                loading={overview.isLoading}
                value={latest ? formatKES(latest.amountDueKes) : "—"}
                caption={latest ? `Due ${formatDate(latest.dueDate)}` : "No bills yet"}
              />
              <StatCard
                index={2}
                label="Last reading"
                icon={<Gauge className="size-4" />}
                loading={overview.isLoading}
                value={latest ? `${formatUnits(latest.consumptionUnits)} units` : "—"}
                caption={latest ? `Period ending ${formatDate(latest.billingPeriodEnd)}` : "Tariff KES 150 / unit"}
              />
            </section>

            <h2 className="mb-3 text-lg font-bold">Bills</h2>
            <DataTable columns={invoiceCols} rows={overview.data?.invoices} loading={overview.isLoading} rowKey={(r) => r.id} empty="No bills yet." />

            <h2 className="mb-3 mt-10 text-lg font-bold">Payments</h2>
            <DataTable columns={paymentCols} rows={overview.data?.payments} loading={overview.isLoading} rowKey={(r) => r.id} empty="No payments recorded yet." />
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
