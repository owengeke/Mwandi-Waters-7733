import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs, SearchInput } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { Modal } from "../components/modal";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { Button } from "../components/ui/button";
import { useClients, useCreateClient } from "../queries/clients";
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

const METER_PATTERN = /^MTR-\d{4,}$/;
const twoDp = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

function AddClientBody({ onClose }: { onClose: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [openingReading, setOpeningReading] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Client | null>(null);
  const create = useCreateClient();
  const busy = create.isPending;

  const onError = (e: unknown) =>
    setError(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

  function submit() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError("Enter the client's full name.");
      return;
    }
    const phone = phoneNumber.trim();
    if (!/^\+?254\d{9}$/.test(phone.replace(/\s+/g, ""))) {
      setError("Enter a Kenyan phone number, e.g. +254712000000.");
      return;
    }
    const meter = meterNumber.trim().toUpperCase();
    if (meter && !METER_PATTERN.test(meter)) {
      setError("Meter numbers look like MTR-0001.");
      return;
    }
    const opening = Number(openingReading);
    if (!openingReading.trim() || !Number.isFinite(opening) || opening < 0) {
      setError("Enter the opening meter reading (0 if the meter starts at zero).");
      return;
    }
    if (!twoDp(opening)) {
      setError("The opening reading can have at most 2 decimal places.");
      return;
    }
    create.mutate(
      { fullName: fullName.trim(), phoneNumber: phone, meterNumber: meter || undefined, openingReading: opening },
      { onSuccess: (client) => setCreated(client), onError },
    );
  }

  if (created) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-success/30 bg-success/8 p-4">
          <p className="text-sm font-semibold text-success">Client added</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {created.fullName} is active and ready for a first meter reading.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Account number
              </dt>
              <dd className="mt-0.5"><Code className="text-primary">{created.accountNumber}</Code></dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meter</dt>
              <dd className="mt-0.5"><Code>{created.meterNumber}</Code></dd>
            </div>
          </dl>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Full name" htmlFor="client-name">
        <Input
          id="client-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Mary Wanjiru"
          disabled={busy}
        />
      </Field>
      <Field label="Phone number" htmlFor="client-phone" hint="Used for bill and payment messages.">
        <Input
          id="client-phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+254712000000"
          disabled={busy}
        />
      </Field>
      <Field
        label="Meter number"
        htmlFor="client-meter"
        hint="Leave blank for an automatic MTR-XXXX number."
      >
        <Input
          id="client-meter"
          value={meterNumber}
          onChange={(e) => setMeterNumber(e.target.value)}
          placeholder="MTR-1042 (optional)"
          disabled={busy}
        />
      </Field>
      <Field
        label="Opening meter reading"
        htmlFor="client-opening"
        hint="The number on the meter today. Creates no charge; the first bill starts from here."
      >
        <Input
          id="client-opening"
          inputMode="decimal"
          value={openingReading}
          onChange={(e) => setOpeningReading(e.target.value)}
          disabled={busy}
        />
      </Field>
      <FormError>{error}</FormError>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <PrimaryButton loading={busy} onClick={submit}>
          Add client
        </PrimaryButton>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [status, setStatus] = useState<ClientStatus>();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const q = useClients({ status, search: search || undefined });

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Clients"
        description="Connected households and businesses, their meters and running balances."
        actions={
          <div className="flex items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search ACC, MTR, name or phone" />
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add client
            </Button>
          </div>
        }
      />
      <FilterTabs options={CLIENT_STATUSES} value={status} onChange={setStatus} />
      <DataTable columns={columns} rows={q.data} loading={q.isLoading} error={q.error} rowKey={(r) => r.id} empty="No clients match." />

      {adding && (
        <Modal
          open
          onClose={() => setAdding(false)}
          title="Add client"
          description="Create an account directly, for example when migrating a legacy connection."
        >
          <AddClientBody onClose={() => setAdding(false)} />
        </Modal>
      )}
    </>
  );
}
