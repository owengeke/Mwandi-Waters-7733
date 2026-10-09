import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { Code } from "../components/code";
import { usePayments } from "../queries/payments";
import { formatDate, formatKES, channelLabel } from "../lib/format";

type Row = NonNullable<ReturnType<typeof usePayments>["data"]>[number];

const columns: Column<Row>[] = [
  { key: "receipt", header: "M-Pesa receipt", cell: (r) => r.payment.mpesaReceiptNumber ? <Code className="text-primary">{r.payment.mpesaReceiptNumber}</Code> : <span className="text-muted-foreground">—</span> },
  { key: "acc", header: "Account", cell: (r) => <Code>{r.client.accountNumber}</Code> },
  { key: "name", header: "Client", cell: (r) => r.client.fullName },
  { key: "channel", header: "Channel", cell: (r) => <span className="text-muted-foreground">{channelLabel(r.payment.paymentChannel)}</span> },
  { key: "date", header: "Payment date", cell: (r) => formatDate(r.payment.paymentDate) },
  { key: "amt", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.payment.amountPaidKes)}</span> },
];

export default function PaymentsPage() {
  const q = usePayments();
  return (
    <>
      <PageHeader eyebrow="Ledger" title="Payments" description="Every shilling received — M-Pesa, bank and cash — posted against client accounts." />
      <DataTable columns={columns} rows={q.data} loading={q.isLoading} error={q.error} rowKey={(r) => r.payment.id} empty="No payments yet." />
    </>
  );
}
