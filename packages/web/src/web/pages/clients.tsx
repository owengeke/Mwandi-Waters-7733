import { useState } from "react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs, SearchInput } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { useClients } from "../queries/clients";
import { formatKES, formatPhone } from "../lib/format";
import { cn } from "../lib/utils";
import { CLIENT_STATUSES, type Client, type ClientStatus } from "../../api/database/schema";

const columns: Column<Client>[] = [
  { key: "acc", header: "Account", cell: (r) => <Code className="text-primary">{r.accountNumber}</Code> },
  { key: "name", header: "Client", cell: (r) => <span className="font-medium">{r.fullName}</span> },
  { key: "meter", header: "Meter", cell: (r) => <Code>{r.meterNumber}</Code> },
  { key: "phone", header: "Phone", cell: (r) => <Code className="text-muted-foreground">{formatPhone(r.phoneNumber)}</Code> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  {
    key: "bal",
    header: "Balance",
    align: "right",
    cell: (r) => (
      <span className={cn("font-semibold", r.currentBalanceKes < 0 && "text-success")}>
        {r.currentBalanceKes < 0 ? `${formatKES(-r.currentBalanceKes)} CR` : formatKES(r.currentBalanceKes)}
      </span>
    ),
  },
];

export default function ClientsPage() {
  const [status, setStatus] = useState<ClientStatus>();
  const [search, setSearch] = useState("");
  const q = useClients({ status, search: search || undefined });

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="Connected households and businesses, their meters and running balances."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search ACC, MTR, name or phone" />}
      />
      <FilterTabs options={CLIENT_STATUSES} value={status} onChange={setStatus} />
      <DataTable columns={columns} rows={q.data} loading={q.isLoading} error={q.error} rowKey={(r) => r.id} empty="No clients match." />
    </>
  );
}
