import { useState } from "react";
import { PageHeader } from "../components/page-header";
import { DataTable, type Column } from "../components/data-table";
import { FilterTabs, SearchInput } from "../components/filter-tabs";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { Modal } from "../components/modal";
import { Field, FormError, Input, PrimaryButton } from "../components/form";
import { Button } from "../components/ui/button";
import {
  useApproveInstallation,
  useInstallations,
  useMarkInstalled,
  useMarkInstallationPaid,
  useRejectInstallation,
} from "../queries/installations";
import { formatDate, formatKES, formatPhone } from "../lib/format";
import { INSTALLATION_STATUSES, type InstallationRequest, type InstallationStatus } from "../../api/database/schema";

/** Default quote shown to the reviewer — the surveyor overrides it per site. */
const DEFAULT_FEE_KES = 12500;
const METER_PATTERN = /^MTR-\d{4,}$/;

/** Next action available for each status; undefined means the request is finished. */
const NEXT_ACTION: Partial<Record<InstallationStatus, string>> = {
  PENDING_REVIEW: "Review",
  APPROVED_PENDING_PAYMENT: "Confirm payment",
  PAID: "Install meter",
};

/** REQ-0006 → 3 of 3 steps done; used for the progress line in the modal. */
const STEP_OF: Record<InstallationStatus, { step: number; label: string }> = {
  PENDING_REVIEW: { step: 1, label: "Site review and fee quote" },
  APPROVED_PENDING_PAYMENT: { step: 2, label: "Awaiting installation fee" },
  PAID: { step: 3, label: "Fee paid — book the meter installation" },
  INSTALLED: { step: 3, label: "Installed — client account created" },
  REJECTED: { step: 0, label: "Rejected" },
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function ReviewBody({ request, onClose }: { request: InstallationRequest; onClose: () => void }) {
  const [fee, setFee] = useState(
    request.installationFeeKes ? String(request.installationFeeKes) : String(DEFAULT_FEE_KES),
  );
  const [reason, setReason] = useState("");
  const [meter, setMeter] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ accountNumber: string; meterNumber: string } | null>(null);

  const approve = useApproveInstallation();
  const reject = useRejectInstallation();
  const markPaid = useMarkInstallationPaid();
  const markInstalled = useMarkInstalled();

  const busy = approve.isPending || reject.isPending || markPaid.isPending || markInstalled.isPending;
  const onError = (e: unknown) =>
    setError(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
  const closeAfter = () => onClose();

  function submitApprove() {
    setError(null);
    const amount = Number(fee);
    if (!fee.trim() || !Number.isFinite(amount) || amount < 0) {
      setError("Enter the installation fee in KES.");
      return;
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      setError("The fee can have at most 2 decimal places.");
      return;
    }
    approve.mutate({ id: request.id, installationFeeKes: amount }, { onSuccess: closeAfter, onError });
  }

  function submitReject() {
    setError(null);
    if (reason.trim().length < 3) {
      setError("Give a short reason — the applicant sees it.");
      return;
    }
    reject.mutate({ id: request.id, reason: reason.trim() }, { onSuccess: closeAfter, onError });
  }

  function submitInstalled() {
    setError(null);
    const supplied = meter.trim().toUpperCase();
    if (supplied && !METER_PATTERN.test(supplied)) {
      setError("Meter numbers look like MTR-0001.");
      return;
    }
    markInstalled.mutate(
      { id: request.id, meterNumber: supplied || undefined },
      { onSuccess: (res) => setCreated({ accountNumber: res.client.accountNumber, meterNumber: res.client.meterNumber }), onError },
    );
  }

  if (created) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-success/30 bg-success/8 p-4">
          <p className="text-sm font-semibold text-success">Installation complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A client account has been created for {request.fullName}.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Detail label="Account number">
              <Code className="text-primary">{created.accountNumber}</Code>
            </Detail>
            <Detail label="Meter number">
              <Code>{created.meterNumber}</Code>
            </Detail>
          </dl>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 rounded-xl border bg-muted/40 p-4 sm:grid-cols-2">
        <Detail label="Applicant">{request.fullName}</Detail>
        <Detail label="Phone">
          <Code className="text-muted-foreground">{formatPhone(request.phoneNumber)}</Code>
        </Detail>
        <Detail label="Physical address">{request.physicalAddress}</Detail>
        <Detail label="Requested">{formatDate(request.createdAt)}</Detail>
        <Detail label="Status">
          <StatusBadge status={request.status} />
        </Detail>
        <Detail label="Installation fee">
          {request.installationFeeKes ? formatKES(request.installationFeeKes) : "Not quoted"}
        </Detail>
      </dl>

      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {STEP_OF[request.status].step > 0 ? `Step ${STEP_OF[request.status].step} of 3 · ` : ""}
        {STEP_OF[request.status].label}
      </p>

      {request.rejectionReason && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">
          Rejected: {request.rejectionReason}
        </p>
      )}

      <FormError>{error}</FormError>

      {request.status === "PENDING_REVIEW" && !showReject && (
        <div className="space-y-4">
          <Field
            label="Installation fee (KES)"
            htmlFor="installation-fee"
            hint="Quote after the site survey. The applicant pays this before installation."
          >
            <Input
              id="installation-fee"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton loading={approve.isPending} disabled={busy} onClick={submitApprove}>
              Approve &amp; send quote
            </PrimaryButton>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowReject(true)}>
              Reject request
            </Button>
          </div>
        </div>
      )}

      {request.status === "PENDING_REVIEW" && showReject && (
        <div className="space-y-4">
          <Field
            label="Reason for rejection"
            htmlFor="rejection-reason"
            hint="Shared with the applicant so they can fix the application."
          >
            <Input
              id="rejection-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Address is outside the service area"
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" disabled={busy} onClick={submitReject}>
              {reject.isPending ? "Rejecting…" : "Confirm rejection"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowReject(false)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {request.status === "APPROVED_PENDING_PAYMENT" && (
        <div className="space-y-4">
          {!showReject ? (
            <>
              <p className="text-sm text-muted-foreground">
                {request.fullName} has been quoted {formatKES(request.installationFeeKes)}. Confirm once the payment is
                received.
              </p>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  loading={markPaid.isPending}
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    markPaid.mutate({ id: request.id }, { onSuccess: closeAfter, onError });
                  }}
                >
                  Confirm fee paid
                </PrimaryButton>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowReject(true)}>
                  Reject request
                </Button>
              </div>
            </>
          ) : (
            <>
              <Field
                label="Reason for rejection"
                htmlFor="rejection-reason"
                hint="Shared with the applicant."
              >
                <Input
                  id="rejection-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Fee not received within 30 days"
                  disabled={busy}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" disabled={busy} onClick={submitReject}>
                  {reject.isPending ? "Rejecting…" : "Confirm rejection"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowReject(false)}>
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {request.status === "PAID" && (
        <div className="space-y-4">
          <Field
            label="Meter number"
            htmlFor="meter-number"
            hint="Leave blank for an automatic MTR-XXXX number. Completing the installation creates the client account."
          >
            <Input
              id="meter-number"
              value={meter}
              onChange={(e) => setMeter(e.target.value)}
              placeholder="MTR-1042 (optional)"
              disabled={busy}
            />
          </Field>
          <PrimaryButton loading={markInstalled.isPending} disabled={busy} onClick={submitInstalled}>
            Complete installation
          </PrimaryButton>
        </div>
      )}

      {request.status === "INSTALLED" && (
        <p className="text-sm text-muted-foreground">
          This request is complete — the client account is active and can be billed.
        </p>
      )}
    </div>
  );
}

export default function InstallationsPage() {
  const [status, setStatus] = useState<InstallationStatus>();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InstallationRequest | null>(null);
  const q = useInstallations({ status, search: search || undefined });

  const columns: Column<InstallationRequest>[] = [
    { key: "ref", header: "Reference", cell: (r) => <Code className="text-primary">{r.referenceNumber}</Code> },
    { key: "name", header: "Applicant", cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: "phone", header: "Phone", cell: (r) => <Code className="text-muted-foreground">{formatPhone(r.phoneNumber)}</Code> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "date", header: "Submitted", cell: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span> },
    { key: "fee", header: "Fee", align: "right", cell: (r) => (r.installationFeeKes ? formatKES(r.installationFeeKes) : <span className="text-muted-foreground">Not quoted</span>) },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          size="sm"
          variant={NEXT_ACTION[r.status] ? "default" : "outline"}
          onClick={() => setSelected(r)}
        >
          {NEXT_ACTION[r.status] ?? "View"}
        </Button>
      ),
    },
  ];

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

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`Request ${selected.referenceNumber}`}
          description={`Submitted by ${selected.fullName} · ${formatDate(selected.createdAt)}`}
        >
          <ReviewBody request={selected} onClose={() => setSelected(null)} />
        </Modal>
      )}
    </>
  );
}
