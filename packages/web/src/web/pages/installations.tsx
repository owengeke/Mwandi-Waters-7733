import { useState } from "react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs, SearchInput } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { useInstallations } from "../queries/installations";
import { formatDate, formatKES, formatPhone } from "../lib/format";
import { INSTALLATION_STATUSES, type InstallationRequest, type InstallationStatus } from "../../api/database/schema";

const columns: Column<InstallationRequest>[] = [
  { key: "ref", header: "Reference", cell: (r) => <Code className="text-primary">{r.referenceNumber}</Code> },
  { key: "name", header: "Applicant", cell: (r) => <span className="font-medium">{r.fullName}</span> },
  { key: "phone", header: "Phone", cell: (r) => <Code className="text-muted-foreground">{formatPhone(r.phoneNumber)}</Code> },
  { key: "addr", header: "Physical address", cell: (r) => <span className="text-muted-foreground">{r.physicalAddress}</span> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  { key: "date", header: "Submitted", cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span> },
  { key: "fee", header: "Installation fee", align: "right", cell: (r) => (r.installationFeeKes ? formatKES(r.installationFeeKes) : <span className="text-muted-foreground">Not quoted</span>) },
];

export default function InstallationsPage() {
  const [status, setStatus] = useState<InstallationStatus>();
  const [search, setSearch] = useState("");
  const q = useInstallations({ status, search: search || undefined });

  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Installation requests"
        description="New water connection applications, from review through fee payment to meter installation."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search REQ, name or phone" />}
      />
      <FilterTabs options={INSTALLATION_STATUSES} value={status} onChange={setStatus} />
      <DataTable columns={columns} rows={q.data} loading={q.isLoading} error={q.error} rowKey={(r) => r.id} empty="No requests match." />
    </>
  );
}
