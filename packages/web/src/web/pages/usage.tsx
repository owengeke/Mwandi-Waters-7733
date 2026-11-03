import { useMemo, useState } from "react";
import type React from "react";
import { PageHeader } from "../components/page-header";
import { Button } from "../components/ui/button";
import { Modal } from "../components/modal";
import { Code } from "../components/code";
import { StatusBadge } from "../components/status-badge";
import { SkeletonTableRows } from "../components/skeleton";
import { Field, Input } from "../components/form";
import {
  useCorrectUsage,
  useRecordManyUsage,
  useRecordUsage,
  useReplaceMeter,
  useSetOpening,
  useUsage,
} from "../queries/usage";
import { useMe } from "../queries/portal";
import { formatDate, formatKES, formatUnits } from "../lib/format";
import { cn } from "../lib/utils";
import { unitsBetween } from "../../api/lib/meter-readings";

interface ReadingSummary {
  id: number;
  readingValue: number;
  previousReading: number;
  unitsConsumed: number;
  readingDate: string;
  isOpening: boolean;
  meterNumber: string | null;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber: string;
  status: string;
  consumptionUnits: number;
  amountDueKes: number;
  amountPaidKes: number;
  dueDate: string;
}

interface UsageRow {
  client: {
    id: number;
    accountNumber: string;
    fullName: string;
    meterNumber: string;
    phoneNumber: string;
    currentBalanceKes: number;
    status: string;
  };
  lastReading: ReadingSummary | null;
  latestBilled: { reading: ReadingSummary; invoice: InvoiceSummary | null } | null;
  opening: ReadingSummary | null;
  averageUnits: number | null;
  readingCount: number;
  canSetOpening: boolean;
  canCorrect: boolean;
}

interface Preview {
  units: number;
  amount: number;
  invalid: boolean;
  message: string | null;
}

interface Warning {
  text: string;
  high: boolean;
}

interface BulkRow {
  clientId: number;
  name: string;
  account: string;
  currentReading: number;
  units: number;
  amount: number;
  warning: string | null;
  high: boolean;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const twoDp = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const messageOf = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";

function previewFrom(previous: number | undefined, raw: string, tariff: number): Preview | null {
  if (previous === undefined || raw.trim() === "") return null;
  const current = Number(raw);
  if (!Number.isFinite(current) || current < 0) {
    return { units: 0, amount: 0, invalid: true, message: "Enter a valid meter reading." };
  }
  if (current < previous) {
    return { units: 0, amount: 0, invalid: true, message: `Must be at least ${formatUnits(previous)}` };
  }
  const units = unitsBetween(previous, current);
  return { units, amount: Math.round(units * tariff * 100) / 100, invalid: false, message: null };
}

function computePreview(row: UsageRow, raw: string, tariff: number): Preview | null {
  return previewFrom(row.lastReading?.readingValue, raw, tariff);
}

/** A correction is measured against the reading's own previous value, not the latest reading. */
function computeCorrectionPreview(row: UsageRow, raw: string, tariff: number): Preview | null {
  return previewFrom(row.latestBilled?.reading.previousReading, raw, tariff);
}

function usageWarning(row: UsageRow, units: number): Warning | null {
  if (units === 0) return { text: "0 units — double-check the meter.", high: false };
  const average = row.averageUnits;
  if (average !== null && average > 0 && units > average * 3) {
    return {
      text: `${(units / average).toFixed(1)}× the client's average of ${formatUnits(average)} units.`,
      high: true,
    };
  }
  return null;
}

export default function UsagePage() {
  const q = useUsage();
  const me = useMe();
  const record = useRecordUsage();
  const recordMany = useRecordManyUsage();
  const setOpening = useSetOpening();
  const replaceMeter = useReplaceMeter();
  const correct = useCorrectUsage();

  const isAdmin = me.data?.role === "super_admin" || me.data?.role === "admin";

  const [readingDate, setReadingDate] = useState(todayISO);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [openingDrafts, setOpeningDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [confirmSingle, setConfirmSingle] = useState<{ row: UsageRow; units: number; warning: string } | null>(null);
  const [correctRow, setCorrectRow] = useState<UsageRow | null>(null);
  const [correctValue, setCorrectValue] = useState("");
  const [replaceRow, setReplaceRow] = useState<UsageRow | null>(null);
  const [replaceMeterNumber, setReplaceMeterNumber] = useState("");
  const [replaceOpening, setReplaceOpening] = useState("0");

  const data = q.data;
  const tariff = data?.tariffPerUnitKes ?? 150;

  const pendingRows = useMemo(() => {
    if (!data) return [] as BulkRow[];
    const out: BulkRow[] = [];
    for (const row of data.clients as UsageRow[]) {
      const raw = drafts[row.client.id];
      if (raw === undefined || raw.trim() === "") continue;
      const preview = computePreview(row, raw, tariff);
      if (!preview || preview.invalid) continue;
      const warning = usageWarning(row, preview.units);
      out.push({
        clientId: row.client.id,
        name: row.client.fullName,
        account: row.client.accountNumber,
        currentReading: Number(raw),
        units: preview.units,
        amount: preview.amount,
        warning: warning?.text ?? null,
        high: warning?.high ?? false,
      });
    }
    return out;
  }, [data, drafts, tariff]);

  const bulkTotalUnits = pendingRows.reduce((sum, r) => sum + r.units, 0);
  const bulkTotalAmount = pendingRows.reduce((sum, r) => sum + r.amount, 0);

  function setDraft(clientId: number, value: string) {
    setDrafts((d) => ({ ...d, [clientId]: value }));
  }

  function clearDraft(clientId: number) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[clientId];
      return next;
    });
  }

  function saveOne(row: UsageRow, confirmHighUsage: boolean) {
    setError(null);
    setSuccess(null);
    const raw = drafts[row.client.id] ?? "";
    const preview = computePreview(row, raw, tariff);
    if (!preview || preview.invalid) {
      setError(preview?.message ?? "Enter the new meter reading.");
      return;
    }
    record.mutate(
      {
        clientId: row.client.id,
        currentReading: Number(raw),
        readingDate,
        confirmHighUsage,
      },
      {
        onSuccess: () => {
          clearDraft(row.client.id);
          setSuccess(
            `Saved ${row.client.fullName}: ${formatUnits(preview.units)} units, ${formatKES(preview.amount)} for next visit.`,
          );
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  }

  function onSaveClick(row: UsageRow) {
    setError(null);
    setSuccess(null);
    const raw = drafts[row.client.id] ?? "";
    const preview = computePreview(row, raw, tariff);
    if (!preview) {
      setError("Enter the new meter reading.");
      return;
    }
    if (preview.invalid) {
      setError(preview.message ?? "Enter a valid meter reading.");
      return;
    }
    const warning = usageWarning(row, preview.units);
    if (warning?.high) {
      setConfirmSingle({ row, units: preview.units, warning: warning.text });
      return;
    }
    saveOne(row, false);
  }

  function saveOpening(row: UsageRow) {
    setError(null);
    setSuccess(null);
    const raw = openingDrafts[row.client.id] ?? String(row.opening?.readingValue ?? 0);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !twoDp(value)) {
      setError("Enter a valid opening reading (0 or more, up to 2 decimal places).");
      return;
    }
    setOpening.mutate(
      { clientId: row.client.id, openingReading: value },
      {
        onSuccess: () => {
          setOpeningDrafts((d) => {
            const next = { ...d };
            delete next[row.client.id];
            return next;
          });
          setSuccess(`Opening reading for ${row.client.fullName} set to ${formatUnits(value)}.`);
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  }

  function prepareBulk() {
    setError(null);
    setSuccess(null);
    if (!data) return;
    const rows: BulkRow[] = [];
    for (const row of data.clients as UsageRow[]) {
      const raw = drafts[row.client.id];
      if (raw === undefined || raw.trim() === "") continue;
      const preview = computePreview(row, raw, tariff);
      if (!preview) continue;
      if (preview.invalid) {
        setError(`${row.client.fullName}: ${preview.message}`);
        return;
      }
      const warning = usageWarning(row, preview.units);
      rows.push({
        clientId: row.client.id,
        name: row.client.fullName,
        account: row.client.accountNumber,
        currentReading: Number(raw),
        units: preview.units,
        amount: preview.amount,
        warning: warning?.text ?? null,
        high: warning?.high ?? false,
      });
    }
    if (rows.length === 0) {
      setError("Enter a current reading for at least one client.");
      return;
    }
    setBulkRows(rows);
    setBulkOpen(true);
  }

  function executeBulk() {
    recordMany.mutate(
      {
        readingDate,
        rows: bulkRows.map((r) => ({
          clientId: r.clientId,
          currentReading: r.currentReading,
          confirmHighUsage: r.high,
        })),
      },
      {
        onSuccess: (res) => {
          setDrafts((d) => {
            const next = { ...d };
            for (const r of bulkRows) delete next[r.clientId];
            return next;
          });
          setBulkOpen(false);
          setSuccess(`Issued ${res.count} reading${res.count === 1 ? "" : "s"}.`);
          setBulkRows([]);
        },
        onError: (e) => {
          setBulkOpen(false);
          setBulkRows([]);
          setError(messageOf(e));
        },
      },
    );
  }

  function saveCorrection() {
    if (!correctRow || !correctRow.latestBilled) return;
    setError(null);
    setSuccess(null);
    const value = Number(correctValue);
    if (!Number.isFinite(value) || value < 0 || !twoDp(value)) {
      setError("Enter a valid reading (0 or more, up to 2 decimal places).");
      return;
    }
    correct.mutate(
      { id: correctRow.latestBilled.reading.id, readingValue: value },
      {
        onSuccess: () => {
          setSuccess(`Corrected the latest reading for ${correctRow.client.fullName}.`);
          setCorrectRow(null);
          setCorrectValue("");
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  }

  function saveReplacement() {
    if (!replaceRow) return;
    setError(null);
    setSuccess(null);
    const meter = replaceMeterNumber.trim().toUpperCase();
    const opening = Number(replaceOpening);
    if (!/^MTR-\d{4,}$/.test(meter)) {
      setError("Meter numbers look like MTR-0001.");
      return;
    }
    if (!Number.isFinite(opening) || opening < 0 || !twoDp(opening)) {
      setError("Enter a valid opening reading for the new meter (up to 2 decimal places).");
      return;
    }
    replaceMeter.mutate(
      { clientId: replaceRow.client.id, meterNumber: meter, openingReading: opening, readingDate },
      {
        onSuccess: () => {
          setSuccess(`Meter replaced for ${replaceRow.client.fullName}. The new chain starts at ${formatUnits(opening)}.`);
          setReplaceRow(null);
          setReplaceMeterNumber("");
          setReplaceOpening("0");
          clearDraft(replaceRow.client.id);
        },
        onError: (e) => setError(messageOf(e)),
      },
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Usage readings"
        description="Enter each client's latest meter reading. Units used and the bill are calculated for you."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reading date
          <input
            type="date"
            aria-label="Reading date"
            value={readingDate}
            onChange={(e) => setReadingDate(e.target.value)}
            max={todayISO()}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <div className="text-sm text-muted-foreground">
          Tariff <span className="font-mono text-foreground">KES {tariff}</span> / unit
        </div>
        <Button onClick={prepareBulk} disabled={pendingRows.length === 0 || recordMany.isPending || q.isLoading}>
          {recordMany.isPending ? "Issuing..." : `Issue ${pendingRows.length} reading${pendingRows.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`Confirm ${bulkRows.length} reading${bulkRows.length === 1 ? "" : "s"}`}
        description={`${formatUnits(bulkTotalUnits)} units, ${formatKES(bulkTotalAmount)} total, dated ${formatDate(readingDate)}.`}
      >
        <div className="mb-4 max-h-60 overflow-auto text-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="pb-2">Account</th>
                <th className="pb-2">Client</th>
                <th className="pb-2 text-right">Reading</th>
                <th className="pb-2 text-right">Units</th>
                <th className="pb-2 text-right">Bill</th>
              </tr>
            </thead>
            <tbody>
              {bulkRows.map((r) => (
                <tr key={r.clientId} className="border-b align-top">
                  <td className="py-2"><Code>{r.account}</Code></td>
                  <td className="py-2">
                    {r.name}
                    {r.warning && <p className="text-[11px] font-medium text-warning">{r.warning}</p>}
                  </td>
                  <td className="py-2 text-right font-mono">{formatUnits(r.currentReading)}</td>
                  <td className="py-2 text-right font-mono">{formatUnits(r.units)}</td>
                  <td className="py-2 text-right font-mono">{formatKES(r.amount)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td colSpan={3} className="py-2 text-right">Total</td>
                <td className="py-2 text-right font-mono">{formatUnits(bulkTotalUnits)}</td>
                <td className="py-2 text-right font-mono">{formatKES(bulkTotalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {bulkRows.some((r) => r.high) && (
          <p className="mb-3 text-xs font-medium text-warning">
            {bulkRows.filter((r) => r.high).length} reading(s) are more than 3× the client&rsquo;s average. Confirming issues them anyway.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button onClick={executeBulk} disabled={recordMany.isPending}>Confirm &amp; issue</Button>
        </div>
      </Modal>

      {confirmSingle && (
        <Modal
          open
          onClose={() => setConfirmSingle(null)}
          title="Confirm high usage"
          description={`${confirmSingle.warning} Issue the bill for ${confirmSingle.row.client.fullName}?`}
        >
          <div className="mb-4 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
            <p className="font-semibold">
              {formatUnits(confirmSingle.units)} units = {formatKES(confirmSingle.units * tariff)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Previous reading {formatUnits(confirmSingle.row.lastReading?.readingValue ?? 0)}.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSingle(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const row = confirmSingle.row;
                setConfirmSingle(null);
                saveOne(row, true);
              }}
              disabled={record.isPending}
            >
              Confirm &amp; issue
            </Button>
          </div>
        </Modal>
      )}

      {correctRow && correctRow.latestBilled && (
        <Modal
          open
          onClose={() => setCorrectRow(null)}
          title={`Correct reading — ${correctRow.client.fullName}`}
          description="Only the most recent reading can be corrected. Payments on the invoice lock this."
        >
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
              <p>
                Previous reading{" "}
                <span className="font-mono font-semibold">
                  {formatUnits(correctRow.latestBilled.reading.previousReading)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded {formatDate(correctRow.latestBilled.reading.readingDate)} · currently{" "}
                {formatUnits(correctRow.latestBilled.reading.readingValue)}
              </p>
            </div>
            <Field label="Corrected meter reading" htmlFor="corrected-reading">
              <Input
                id="corrected-reading"
                inputMode="decimal"
                value={correctValue}
                onChange={(e) => setCorrectValue(e.target.value)}
                invalid={computeCorrectionPreview(correctRow, correctValue, tariff)?.invalid ? true : undefined}
              />
            </Field>
            {(() => {
              const preview = computeCorrectionPreview(correctRow, correctValue, tariff);
              if (!preview) return null;
              return preview.invalid ? (
                <p className="text-xs font-medium text-destructive">{preview.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {formatUnits(preview.units)} units · {formatKES(preview.amount)}
                </p>
              );
            })()}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCorrectRow(null)}>Cancel</Button>
              <Button onClick={saveCorrection} disabled={correct.isPending}>Save correction</Button>
            </div>
          </div>
        </Modal>
      )}

      {replaceRow && (
        <Modal
          open
          onClose={() => setReplaceRow(null)}
          title={`Meter replaced — ${replaceRow.client.fullName}`}
          description="Assign the new meter and its opening reading. Old history stays; the new chain starts here."
        >
          <div className="space-y-4">
            <Field label="New meter number" htmlFor="new-meter-number" hint="For example MTR-1042.">
              <Input
                id="new-meter-number"
                value={replaceMeterNumber}
                onChange={(e) => setReplaceMeterNumber(e.target.value)}
                placeholder="MTR-1042"
              />
            </Field>
            <Field label="Opening reading on the new meter" htmlFor="new-meter-opening" hint="Decimals allowed; never negative.">
              <Input
                id="new-meter-opening"
                inputMode="decimal"
                value={replaceOpening}
                onChange={(e) => setReplaceOpening(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReplaceRow(null)}>Cancel</Button>
              <Button onClick={saveReplacement} disabled={replaceMeter.isPending}>Replace meter</Button>
            </div>
          </div>
        </Modal>
      )}

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {success && <p className="mb-3 text-sm text-primary">{success}</p>}
      {q.error && (
        <p className="mb-3 text-sm text-destructive">
          Could not load readings: {q.error instanceof Error ? q.error.message : "please try again."}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-right">Current reading</th>
              <th className="px-3 py-2 text-right">Preview</th>
              <th className="px-3 py-2 text-left">Invoice</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <SkeletonTableRows rows={5} columns={7} />}
            {!q.isLoading && (data?.clients as UsageRow[] | undefined)?.map((row) => {
              const raw = drafts[row.client.id] ?? "";
              const preview = computePreview(row, raw, tariff);
              const warning = preview && !preview.invalid ? usageWarning(row, preview.units) : null;
              const previous = row.lastReading;
              const billed = row.latestBilled;
              const hasPayment = !!billed?.invoice && Number(billed.invoice.amountPaidKes) > 0;
              const busy = record.isPending || setOpening.isPending || replaceMeter.isPending;

              return (
                <tr key={row.client.id} className="border-t align-top">
                  <td className="px-3 py-3"><Code>{row.client.accountNumber}</Code></td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{row.client.fullName}</span>
                    <p className="mt-0.5 text-[11px] text-muted-foreground"><Code>{row.client.meterNumber}</Code></p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min={previous?.readingValue ?? 0}
                      max={10_000_000}
                      value={raw}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(row.client.id, e.target.value)}
                      aria-label={`Current reading for ${row.client.fullName}`}
                      placeholder={previous ? formatUnits(previous.readingValue) : "Set opening first"}
                      disabled={!previous || busy}
                      className={cn(
                        "h-11 w-28 rounded-md border bg-background px-2 text-right text-sm",
                        preview?.invalid && "border-destructive",
                      )}
                    />
                    <p className="mt-1 max-w-[16rem] text-right text-[11px] leading-snug text-muted-foreground">
                      {previous ? (
                        <>
                          Previous{" "}
                          <span className="font-mono text-foreground">{formatUnits(previous.readingValue)}</span>
                          <span className="hidden sm:inline"> · {formatDate(previous.readingDate)}</span>
                        </>
                      ) : row.canSetOpening ? (
                        "Set an opening reading below"
                      ) : (
                        "No previous reading"
                      )}
                    </p>

                    {row.canSetOpening && isAdmin && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={openingDrafts[row.client.id] ?? String(row.opening?.readingValue ?? 0)}
                          onChange={(e) => setOpeningDrafts((d) => ({ ...d, [row.client.id]: e.target.value }))}
                          aria-label={`Opening reading for ${row.client.fullName}`}
                          className="h-9 w-24 rounded-md border bg-background px-2 text-right text-xs"
                          disabled={busy}
                        />
                        <Button size="sm" variant="outline" onClick={() => saveOpening(row)} disabled={busy}>
                          Save opening
                        </Button>
                      </div>
                    )}
                    {row.canSetOpening && !isAdmin && (
                      <p className="mt-2 text-right text-[11px] text-muted-foreground">
                        An admin must set the opening reading.
                      </p>
                    )}
                    {warning && (
                      <p className="mt-0.5 text-right text-[11px] font-medium text-warning">{warning.text}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {preview && !preview.invalid ? (
                      <>
                        <p className="font-mono">{formatKES(preview.amount)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatUnits(preview.units)} units used</p>
                      </>
                    ) : preview?.invalid ? (
                      <span className="text-[11px] font-medium text-destructive">{preview.message}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {billed?.invoice ? (
                      <Code className="text-primary">{billed.invoice.invoiceNumber}</Code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {billed?.invoice ? (
                      <StatusBadge status={billed.invoice.status} />
                    ) : (
                      <span className="text-muted-foreground">Not billed</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {raw.trim() !== "" && (
                        <Button size="sm" onClick={() => onSaveClick(row)} disabled={busy || !!preview?.invalid}>
                          Save
                        </Button>
                      )}
                      {row.canCorrect && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCorrectRow(row);
                            setCorrectValue(String(billed?.reading.readingValue ?? ""));
                          }}
                          disabled={busy}
                        >
                          Correct
                        </Button>
                      )}
                      {billed?.invoice && hasPayment && (
                        <span className="self-center text-xs text-muted-foreground" title="Payments applied; correction locked.">
                          Locked
                        </span>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReplaceRow(row);
                            setReplaceMeterNumber(row.client.meterNumber);
                            setReplaceOpening("0");
                          }}
                          disabled={busy}
                        >
                          Meter replaced
                        </Button>
                      )}
                    </div>
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
