import { useState } from "react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { useInvoices } from "../queries/invoices";
import { formatDate, formatKES, formatUnits } from "../lib/format";
import { INVOICE_STATUSES, type InvoiceStatus } from "../../api/database/schema";

type Row = NonNullable<ReturnType<typeof useInvoices>["data"]>[number];

const columns: Column<Row>[] = [
  { key: "no", header: "Invoice", cell: (r) => <Code className="text-primary">{r.invoice.invoiceNumber}</Code> },
  { key: "acc", header: "Account", cell: (r) => <Code>{r.client.accountNumber}</Code> },
  { key: "name", header: "Client", cell: (r) => r.client.fullName },
  {
    key: "period",
    header: "Billing period",
    cell: (r) => (
      <span className="text-muted-foreground">
        {formatDate(r.invoice.billingPeriodStart)} – {formatDate(r.invoice.billingPeriodEnd)}
      </span>
    ),
  },
  { key: "units", header: "Units", align: "right", cell: (r) => <Code>{formatUnits(r.invoice.consumptionUnits)}</Code> },
  { key: "due", header: "Amount due", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.invoice.amountDueKes)}</span> },
  { key: "paid", header: "Paid", align: "right", cell: (r) => <span className="text-muted-foreground">{formatKES(r.invoice.amountPaidKes)}</span> },
  { key: "dd", header: "Due date", cell: (r) => formatDate(r.invoice.dueDate) },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.invoice.status} /> },
];

export default function InvoicesPage() {
  const [status, setStatus] = useState<InvoiceStatus>();
  const q = useInvoices({ status });
  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Monthly consumption bills. Amount due is calculated as units × KES 150."
      />
      <FilterTabs options={INVOICE_STATUSES} value={status} onChange={setStatus} />
      <DataTable columns={columns} rows={q.data} loading={q.isLoading} error={q.error} rowKey={(r) => r.invoice.id} empty="No invoices match." />
    </>
  );
}
