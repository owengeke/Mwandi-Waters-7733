import { useCallback, useState } from "react";
import { ArrowUpRight, RefreshCw, ReceiptText } from "lucide-react";
import type { Invoice } from "../../api/database/schema";
import { ClientShell } from "../components/client-shell";
import { Code } from "../components/code";
import { BalanceCard, OpenInvoicesCard } from "../components/client/billing-summary";
import { BillsCard } from "../components/client/bills-card";
import { PaymentsCard } from "../components/client/payments-card";
import { UsageCard } from "../components/client/usage-card";
import { AccountDetailsCard } from "../components/client/account-details-card";
import { PaymentDialog } from "../components/client/payment-dialog";
import { DemoBadge, Section } from "../components/client/section";
import { useAccountOverview, outstandingKes } from "../queries/account";
import { useMe } from "../queries/portal";
import { formatKES, formatUnits } from "../lib/format";

export const Dashboard = function Dashboard() {
  const me = useMe();
  const overview = useAccountOverview();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);

  const client = overview.data?.client;
  const invoices = overview.data?.invoices ?? [];
  const payments = overview.data?.payments ?? [];
  const mpesa = overview.data?.mpesa ?? { demoMode: true, paybill: "" };
  const openInvoices = invoices.filter((invoice) => outstandingKes(invoice) > 0);
  const firstName = (client?.fullName ?? me.data?.name ?? "there").split(/\s+/)[0];

  const refetch = overview.refetch;
  const onPaid = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openPayment = (invoice?: Invoice) => {
    setPayTarget(invoice ?? openInvoices[0] ?? null);
    setDialogOpen(true);
  };

  const closePayment = () => {
    setDialogOpen(false);
    // A late callback may have landed while the dialog was open.
    void refetch();
  };

  return (
    <ClientShell status={client?.status}>
      <div className="space-y-10 md:space-y-12">
        <header className="rise flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Your water account
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Habari, {firstName}.</h1>
            {client ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Account <Code className="text-primary">{client.accountNumber}</Code>
                </span>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                <span>
                  Meter <Code>{client.meterNumber}</Code>
                </span>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                <span>{formatUnits(invoices[0]?.consumptionUnits ?? 0)} units last period</span>
              </p>
            ) : (
              <div className="mt-3 h-4 w-64 animate-pulse rounded bg-muted" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {mpesa.demoMode && <DemoBadge className="hidden sm:inline-flex" />}
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Refresh account"
              title="Refresh account"
              className="inline-flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => openPayment()}
              disabled={openInvoices.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pay bill
              <ArrowUpRight className="size-4" />
            </button>
          </div>
        </header>

        {overview.error ? (
          <div className="rounded-xl border border-destructive/25 bg-card p-6" role="alert">
            <p className="text-sm font-semibold text-destructive">We couldn&rsquo;t load your account.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {overview.error instanceof Error ? overview.error.message : "Please try again in a moment."}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-semibold hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </button>
          </div>
        ) : (
          <>
            <section id="overview" aria-labelledby="overview-title" className="scroll-mt-24">
              <h2 id="overview-title" className="sr-only">
                Overview
              </h2>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <BalanceCard client={client} invoices={invoices} loading={overview.isLoading} onPay={openPayment} />
                </div>
                <OpenInvoicesCard invoices={invoices} loading={overview.isLoading} onPay={openPayment} />
              </div>
            </section>

            <Section
              id="bills"
              title="Bills"
              description="Every statement on your account, newest first. Pay any outstanding balance with M-Pesa."
              action={
                openInvoices.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-semibold text-destructive">
                    <ReceiptText className="size-3.5" />
                    {formatKES(openInvoices.reduce((sum, invoice) => sum + outstandingKes(invoice), 0))} outstanding
                  </span>
                ) : undefined
              }
            >
              <BillsCard
                invoices={invoices}
                loading={overview.isLoading}
                error={overview.error}
                onPay={openPayment}
              />
            </Section>

            <Section
              id="payments"
              title="Payments"
              description="M-Pesa receipts are available as PDFs for your records."
            >
              <PaymentsCard
                payments={payments}
                invoices={invoices}
                loading={overview.isLoading}
                error={overview.error}
              />
            </Section>

            <Section id="usage" title="Usage" description="See how much water your household used each month.">
              <UsageCard invoices={invoices} loading={overview.isLoading} />
            </Section>

            <Section id="account" title="Account" description="Your service details and the easiest way to pay.">
              <AccountDetailsCard
                client={client}
                loading={overview.isLoading}
                demoMode={mpesa.demoMode}
                paybill={mpesa.paybill}
              />
            </Section>
          </>
        )}
      </div>

      <PaymentDialog
        open={dialogOpen}
        onClose={closePayment}
        onPaid={onPaid}
        initialInvoice={payTarget}
        invoices={invoices}
        client={client}
        mpesa={mpesa}
      />
    </ClientShell>
  );
};

export default Dashboard;
