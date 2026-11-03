import { Link, useParams } from "wouter";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { Button } from "../components/ui/button";
import { useToast } from "../components/toast";
import { useClient } from "../queries/clients";
import { useSendClientLink } from "../queries/onboarding";
import { channelLabel, formatDate, formatKES, formatPhone, formatUnits, humanize } from "../lib/format";
import type { Invoice, Payment } from "../../api/database/schema";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

const invoiceColumns: Column<Invoice>[] = [
  { key: "no", header: "Invoice", cell: (r) => <Code className="text-primary">{r.invoiceNumber}</Code> },
  {
    key: "period",
    header: "Period",
    cell: (r) => (
      <span className="text-muted-foreground">
        {formatDate(r.billingPeriodStart)} – {formatDate(r.billingPeriodEnd)}
      </span>
    ),
  },
  { key: "units", header: "Units", align: "right", cell: (r) => <Code>{formatUnits(r.consumptionUnits)}</Code> },
  { key: "due", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.amountDueKes)}</span> },
  { key: "paid", header: "Paid", align: "right", cell: (r) => <span className="text-muted-foreground">{formatKES(r.amountPaidKes)}</span> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
];

const paymentColumns: Column<Payment>[] = [
  { key: "date", header: "Date", cell: (r) => formatDate(r.paymentDate) },
  { key: "amount", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatKES(r.amountPaidKes)}</span> },
  { key: "channel", header: "Channel", cell: (r) => <span className="text-muted-foreground">{channelLabel(r.paymentChannel)}</span> },
  { key: "receipt", header: "Receipt", cell: (r) => (r.mpesaReceiptNumber ? <Code>{r.mpesaReceiptNumber}</Code> : <span className="text-muted-foreground">—</span>) },
];

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;

  const query = useClient(valid ? id : undefined);
  const sendLink = useSendClientLink();
  const toast = useToast();

  if (!valid) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">That client could not be found.</p>
        <Link to="/clients" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" /> Loading client…
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "That client could not be found."}
        </p>
        <Link to="/clients" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  const client = query.data;

  async function handleResend() {
    try {
      const result = await sendLink.mutateAsync({ id });
      toast({
        title: result.sent ? "WhatsApp link sent" : "Link created",
        description: result.devLink
          ? result.devLink
          : result.sent
            ? "The client can complete their details and set a password."
            : "No WhatsApp/SMS provider is configured, so nothing was delivered.",
      });
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not send the link",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    <>
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/clients" className="hover:text-foreground">
          Clients
        </Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-foreground">{client.fullName}</span>
      </nav>

      <PageHeader
        title={client.fullName}
        description={`Water account ${client.accountNumber}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={client.status} />
            <Button variant="outline" disabled={sendLink.isPending} onClick={handleResend}>
              <Send className="size-4" />
              {sendLink.isPending ? "Sending…" : "Send details link"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">Account</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Account number">
                <Code className="text-primary">{client.accountNumber}</Code>
              </Detail>
              <Detail label="Meter number">
                <Code>{client.meterNumber}</Code>
              </Detail>
              <Detail label="Phone">
                <Code className="text-muted-foreground">{formatPhone(client.phoneNumber)}</Code>
              </Detail>
              <Detail label="Email">{client.email ?? <span className="text-muted-foreground">Not provided</span>}</Detail>
              <Detail label="Balance">
                <span className={client.currentBalanceKes < 0 ? "font-semibold text-success" : "font-semibold"}>
                  {client.currentBalanceKes < 0
                    ? `${formatKES(-client.currentBalanceKes)} CR`
                    : formatKES(client.currentBalanceKes)}
                </span>
              </Detail>
              <Detail label="Joined">{formatDate(client.createdAt)}</Detail>
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-bold text-foreground">Property</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Property type">
                {client.propertyType ? humanize(client.propertyType) : <span className="text-muted-foreground">Not provided</span>}
              </Detail>
              <Detail label="Occupant">
                {client.occupantType ? humanize(client.occupantType) : <span className="text-muted-foreground">Not provided</span>}
              </Detail>
              <Detail label="Estate or area">{client.estate ?? <span className="text-muted-foreground">—</span>}</Detail>
              <Detail label="Plot or house number">{client.plotOrHouseNo ?? <span className="text-muted-foreground">—</span>}</Detail>
              <Detail label="Nearest landmark">{client.landmark ?? <span className="text-muted-foreground">—</span>}</Detail>
              <Detail label="Landlord phone">
                {client.landlordPhone ? (
                  <Code className="text-muted-foreground">{formatPhone(client.landlordPhone)}</Code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Detail>
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">Invoices</h2>
            <DataTable
              columns={invoiceColumns}
              rows={client.invoices}
              rowKey={(r) => r.id}
              empty="No invoices yet."
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">Payments</h2>
            <DataTable
              columns={paymentColumns}
              rows={client.payments}
              rowKey={(r) => r.id}
              empty="No payments yet."
            />
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
                <MessageCircle className="size-4" aria-hidden />
              </span>
              <h2 className="text-base font-bold text-foreground">WhatsApp &amp; login</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Send a one-time link so the client can confirm their details and set their own password. Links expire
              after 7 days and stop working once used.
            </p>
            <Button className="mt-4 h-11 w-full" variant="outline" disabled={sendLink.isPending} onClick={handleResend}>
              <Send className="size-4" />
              {sendLink.isPending ? "Sending…" : "Send details link"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              We never share or display passwords. The client sets their own.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}