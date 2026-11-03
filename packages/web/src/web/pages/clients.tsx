import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Plus } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs, SearchInput } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { Button } from "../components/ui/button";
import { useClientDrafts, useClients } from "../queries/clients";
import { formatDate, formatKES, formatPhone } from "../lib/format";
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

type Tab = "accounts" | "drafts";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function ClientsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const initialTab: Tab = new URLSearchParams(search).get("tab") === "drafts" ? "drafts" : "accounts";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [status, setStatus] = useState<ClientStatus>();
  const [query, setQuery] = useState("");

  const accounts = useClients({ status, search: query || undefined });
  const drafts = useClientDrafts();

  const draftRows = useMemo(() => {
    const rows = drafts.data ?? [];
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      [row.fullName, row.phoneNumber, row.email, row.estate, row.plotOrHouseNo]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [drafts.data, query]);

  const draftColumns: Column<Client>[] = [
    { key: "name", header: "Client", cell: (r) => <span className="font-medium">{r.fullName}</span> },
    {
      key: "phone",
      header: "Phone",
      cell: (r) => <Code className="text-muted-foreground">{formatPhone(r.phoneNumber)}</Code>,
    },
    {
      key: "property",
      header: "Property",
      cell: (r) => (
        <span className="text-muted-foreground">
          {[r.estate, r.plotOrHouseNo].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Last saved",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => navigate(`/clients/new?draft=${r.id}`)}>
          Continue
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="Connected households and businesses, their meters and running balances."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search ACC, MTR, name or phone" />
            <Button asChild>
              <Link to="/clients/new">
                <Plus className="size-4" /> Add client
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")}>
          Accounts
        </TabButton>
        <TabButton active={tab === "drafts"} onClick={() => setTab("drafts")}>
          Drafts{drafts.data?.length ? ` (${drafts.data.length})` : ""}
        </TabButton>
      </div>

      {tab === "accounts" ? (
        <>
          <FilterTabs options={CLIENT_STATUSES} value={status} onChange={setStatus} />
          <DataTable
            columns={columns}
            rows={accounts.data}
            loading={accounts.isLoading}
            error={accounts.error}
            rowKey={(r) => r.id}
            empty="No clients match."
          />
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Saved drafts are not active accounts. Finish one to assign its account and meter numbers.
          </p>
          <DataTable
            columns={draftColumns}
            rows={draftRows}
            loading={drafts.isLoading}
            error={drafts.error}
            rowKey={(r) => r.id}
            empty="No drafts yet."
          />
        </>
      )}
    </>
  );
}