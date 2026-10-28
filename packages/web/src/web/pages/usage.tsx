import { useState } from "react";
import type React from "react";
import { PageHeader } from "../components/page-header";
import { Button } from "../components/ui/button";
import { Modal } from "../components/modal";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { useUsage, useIssueUsage, useBulkUsage, useCorrectUsage } from "../queries/usage";
import { formatKES } from "../lib/format";

export default function UsagePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useUsage(month);
  const issue = useIssueUsage();
  const bulk = useBulkUsage();
  const correct = useCorrectUsage();

  const [editing, setEditing] = useState<number | null>(null);
  const [draftUnits, setDraftUnits] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkConfirmRows, setBulkConfirmRows] = useState<Array<{ clientId: number; units: number; preview: number; name: string; account: string }>>([]);

  const data = q.data;
  const tariff = data?.tariffPerUnitKes ?? 150;
  const maxMonth = new Date().toISOString().slice(0, 7);

  function onUnitsChange(clientId: number, v: string) {
    setDraftUnits((d) => ({ ...d, [clientId]: v }));
  }

  function issueOne(clientId: number) {
    setError(null);
    setSuccess(null);
    const raw = draftUnits[clientId];
    const u = Number(raw);
    if (!Number.isFinite(u) || u < 0) {
      setError("Enter a valid unit count.");
      return;
    }
    if (u === 0 && !window.confirm("Issue invoice with 0 units? This will create a KES 0 invoice.")) {
      return;
    }
    issue.mutate(
      { clientId, month, consumptionUnits: u },
      {
        onSuccess: () => {
          setSuccess(`Issued for client ${clientId}.`);
          setDraftUnits((d) => {
            const n = { ...d };
            delete n[clientId];
            return n;
          });
        },
        onError: (e: any) => setError(e?.message ?? "Issue failed."),
      },
    );
  }

  function prepareBulkConfirm() {
    setError(null);
    setSuccess(null);
    if (!data) return;
    const rows = data.clients
      .filter((c) => c.invoice === null)
      .map((c) => {
        const raw = draftUnits[c.client.id] ?? "0";
        const u = Number(raw);
        return {
          clientId: c.client.id,
          units: Number.isFinite(u) && u >= 0 ? u : 0,
          preview: (Number.isFinite(u) && u >= 0 ? u : 0) * tariff,
          name: c.client.fullName,
          account: c.client.accountNumber,
        };
      })
      .filter((r) => r.units > 0 || r.preview >= 0);
    if (rows.length === 0) {
      setError("Nothing to issue — enter units for at least one unissued client.");
      return;
    }
    setBulkConfirmRows(rows);
    setBulkConfirmOpen(true);
  }

  function executeBulkIssue() {
    if (!data) return;
    const rows = bulkConfirmRows.map((r) => ({ clientId: r.clientId, consumptionUnits: r.units }));
    bulk.mutate(
      { month, rows },
      {
        onSuccess: (res: any) => {
          setSuccess(`Issued ${res?.count ?? rows.length} invoice(s).`);
          setBulkConfirmOpen(false);
          setBulkConfirmRows([]);
        },
        onError: (e: any) => {
          setError(e?.message ?? "Bulk issue failed.");
          setBulkConfirmOpen(false);
          setBulkConfirmRows([]);
        },
      },
    );
  }

  function saveCorrection(invoiceId: number) {
    setError(null);
    setSuccess(null);
    const raw = draftUnits[invoiceId];
    const u = Number(raw);
    if (!Number.isFinite(u) || u < 0) {
      setError("Enter a valid unit count.");
      return;
    }
    correct.mutate(
      { id: invoiceId, consumptionUnits: u },
      {
        onSuccess: () => {
          setSuccess(`Corrected invoice ${invoiceId}.`);
          setEditing(null);
        },
        onError: (e: any) => setError(e?.message ?? "Correction failed."),
      },
    );
  }

  const totalUnits = bulkConfirmRows.reduce((s, r) => s + r.units, 0);
  const totalPreview = bulkConfirmRows.reduce((s, r) => s + r.preview, 0);

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Monthly usage"
        description="Issue each client's water usage for a billing month. One invoice per client per month; rate snapshot per invoice."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Billing month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            max={maxMonth}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="text-sm text-muted-foreground">
          Tariff <span className="font-mono text-foreground">KES {tariff}</span> / unit
        </div>
        <Button onClick={prepareBulkConfirm} disabled={bulk.isPending || q.isLoading}>
          {bulk.isPending ? "Issuing…" : "Issue all pending"}
        </Button>
        <Modal
          open={bulkConfirmOpen}
          onClose={() => setBulkConfirmOpen(false)}
          title="Confirm bulk issue"
          description={`${bulkConfirmRows.length} client(s), ${totalUnits.toFixed(2)} units, ${formatKES(totalPreview)} total.`}
        >
          <div className="max-h-60 overflow-auto mb-4 text-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Client</th>
                  <th className="pb-2 text-right">Units</th>
                  <th className="pb-2 text-right">Preview</th>
                </tr>
              </thead>
              <tbody>
                {bulkConfirmRows.map((r) => (
                  <tr key={r.clientId} className="border-b">
                    <td className="py-2"><Code>{r.account}</Code></td>
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right font-mono">{r.units.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{formatKES(r.preview)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td colSpan={2} className="py-2 text-right">Total</td>
                  <td className="py-2 text-right font-mono">{totalUnits.toFixed(2)}</td>
                  <td className="py-2 text-right font-mono">{formatKES(totalPreview)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executeBulkIssue} disabled={bulk.isPending}>
              Confirm & issue
            </Button>
          </div>
        </Modal>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {success && <p className="mb-3 text-sm text-primary">{success}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Preview (KES)</th>
              <th className="px-3 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!q.isLoading && data?.clients.map((c) => {
              const inv = c.invoice;
              const raw = draftUnits[c.client.id] ?? (inv ? String(inv.consumptionUnits) : "");
              const preview = Number(raw) >= 0 && Number.isFinite(Number(raw))
                ? Number(raw) * tariff
                : 0;
              const hasPayment = !!inv && Number(inv.amountPaidKes) > 0;
              return (
                <tr key={c.client.id} className="border-t">
                  <td className="px-3 py-2"><Code>{c.client.accountNumber}</Code></td>
                  <td className="px-3 py-2">{c.client.fullName}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={10000}
                      value={raw}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUnitsChange(c.client.id, e.target.value)}
                      className="w-24 rounded-md border bg-background px-2 py-1 text-right text-sm"
                      disabled={!!inv && editing !== inv.id}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatKES(preview)}</td>
                  <td className="px-3 py-2">
                    {inv ? <Code className="text-primary">{inv.invoiceNumber}</Code> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {inv ? <StatusBadge status={inv.status} /> : <span className="text-muted-foreground">Not issued</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!inv && (
                      <Button size="sm" onClick={() => issueOne(c.client.id)} disabled={issue.isPending}>
                        Issue
                      </Button>
                    )}
                    {inv && !hasPayment && editing !== inv.id && (
                      <Button size="sm" variant="outline" onClick={() => { setEditing(inv.id); onUnitsChange(c.client.id, String(inv.consumptionUnits)); }}>
                        Correct
                      </Button>
                    )}
                    {inv && hasPayment && (
                      <span className="text-xs text-muted-foreground" title="Payments applied; correction locked.">
                        Locked
                      </span>
                    )}
                    {inv && editing === inv.id && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => saveCorrection(inv.id)} disabled={correct.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}