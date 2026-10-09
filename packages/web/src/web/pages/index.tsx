import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ClipboardList, Users, Wallet } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { DataTable, type Column } from "../components/data-table";
import { Code } from "../components/code";
import { useDashboardSummary } from "../queries/dashboard";
import { usePayments } from "../queries/payments";
import { channelLabel, formatDate, formatKES } from "../lib/format";

type PaymentRow = NonNullable<ReturnType<typeof usePayments>["data"]>[number];

const columns: Column<PaymentRow>[] = [
  { key: "receipt", header: "Receipt", cell: (r) => <Code>{r.payment.mpesaReceiptNumber ?? "—"}</Code> },
  { key: "acc", header: "Account", cell: (r) => <Code className="text-primary">{r.client.accountNumber}</Code> },
  { key: "name", header: "Client", cell: (r) => r.client.fullName },
  { key: "channel", header: "Channel", cell: (r) => <span className="text-muted-foreground">{channelLabel(r.payment.paymentChannel)}</span> },
  { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground">{formatDate(r.payment.paymentDate)}</span> },
  { key: "amt", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.payment.amountPaidKes)}</span> },
];

export default function Dashboard() {
  const summary = useDashboardSummary();
  const recent = usePayments();
  const s = summary.data;
  const month = new Intl.DateTimeFormat("en-KE", { month: "long" }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Network at a glance"
        description="Collections, arrears and connection pipeline across all Mwandi Waters accounts."
      />

      <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          emphasis
          label={`Collected · ${month}`}
          icon={<Wallet className="size-4" />}
          loading={summary.isLoading}
          value={formatKES(s?.collectionsThisMonth.amountKes)}
          caption={`${s?.collectionsThisMonth.count ?? 0} payments posted`}
        />
        <StatCard
          index={1}
          label="Outstanding balances"
          icon={<Users className="size-4" />}
          loading={summary.isLoading}
          value={formatKES(s?.outstandingKes)}
          caption={`${s?.clients.active ?? 0} of ${s?.clients.total ?? 0} accounts active`}
        />
        <StatCard
          index={2}
          label="Overdue"
          icon={<AlertTriangle className="size-4 text-destructive" />}
          loading={summary.isLoading}
          value={formatKES(s?.overdue.amountKes)}
          caption={`${s?.overdue.count ?? 0} invoices past due`}
        />
        <StatCard
          index={3}
          label="Open connection requests"
          icon={<ClipboardList className="size-4" />}
          loading={summary.isLoading}
          value={s?.openInstallationRequests ?? 0}
          caption="Pending review, payment or installation"
        />
      </section>

      <div className="rise mb-3 flex items-end justify-between" style={{ "--i": 3 } as React.CSSProperties}>
        <h2 className="text-lg font-bold">Recent payments</h2>
        <Link to="/payments" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          View ledger <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <DataTable
        columns={columns}
        rows={recent.data?.slice(0, 6)}
        loading={recent.isLoading}
        error={recent.error}
        rowKey={(r) => r.payment.id}
        empty="No payments recorded yet."
      />
    </>
  );
}
