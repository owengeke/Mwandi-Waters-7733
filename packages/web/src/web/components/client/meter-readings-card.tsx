import { BarChart3, Droplets } from "lucide-react";
import { formatDate, formatKES, formatUnits } from "../../lib/format";
import { cn } from "../../lib/utils";
import { useMeterHistory } from "../../queries/usage";
import { StatusBadge } from "../status-badge";
import { EmptyState, Panel, Skeleton } from "./section";
import type { MeterChartPoint, MeterHistoryReading } from "../../../api/lib/meter-readings";

const monthShort = new Intl.DateTimeFormat("en-KE", { month: "short", timeZone: "UTC" });
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function changeText(change: number | null) {
  if (change === null) return null;
  if (change === 0) return { label: "No change", tone: "text-muted-foreground" };
  const sign = change > 0 ? "+" : "−";
  return {
    label: `${sign}${formatUnits(Math.abs(change))} units`,
    tone: change > 0 ? "text-warning" : "text-success",
  };
}

function LatestCard({ reading }: { reading: MeterHistoryReading }) {
  const change = changeText(reading.changeUnits);
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/8 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary-foreground">
            Latest reading
          </span>
          <p className="mt-2 text-sm font-semibold">{formatDate(reading.readingDate)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Meter {reading.meterNumber ?? "—"} · read {formatUnits(reading.readingValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {formatUnits(reading.unitsConsumed)}
            <span className="ml-1 text-sm font-semibold text-muted-foreground">units</span>
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatKES(reading.amountKes ?? 0)}</p>
          {change && <p className={cn("mt-1 text-xs font-semibold tabular-nums", change.tone)}>{change.label}</p>}
        </div>
      </div>
    </div>
  );
}

/** Theme-aware bars; the table below is the accessible equivalent. */
function MeterChart({ chart }: { chart: MeterChartPoint[] }) {
  const rows = chart;
  const max = Math.max(...rows.map((p) => p.units), 1);
  const summary = rows.map((p) => `${formatDate(p.readingDate)}: ${formatUnits(p.units)} units`).join("; ");

  return (
    <figure className="m-0 mt-6">
      <div className="overflow-x-auto pb-1" aria-hidden="true">
        <div className="flex min-w-max items-end gap-2 sm:gap-3">
          {rows.map((point, i) => {
            const height = Math.max(6, (point.units / max) * 100);
            const start = asDate(point.readingDate);
            return (
              <div key={`${point.readingDate}-${point.readingValue}`} className="flex w-9 flex-col items-center sm:w-11">
                <span
                  className={cn(
                    "mb-1.5 h-4 whitespace-nowrap text-[10px] font-semibold tabular-nums",
                    point.isLatest ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {formatUnits(point.units)}
                </span>
                <div className="flex h-32 w-full items-end justify-center border-b border-dashed border-border/80">
                  <div
                    className={cn(
                      "grow-bar w-full rounded-t-md transition-colors",
                      point.isLatest ? "bg-primary" : "bg-primary/25 hover:bg-primary/40",
                    )}
                    style={{ height: `${height}%`, "--i": i } as React.CSSProperties}
                  />
                </div>
                <span className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {start.getUTCDate()}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {monthShort.format(start)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function ReadingsTable({ readings }: { readings: MeterHistoryReading[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Your meter readings, newest first.</caption>
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Date</th>
            <th scope="col" className="px-3 py-2 text-right">Previous</th>
            <th scope="col" className="px-3 py-2 text-right">Current</th>
            <th scope="col" className="px-3 py-2 text-right">Units used</th>
            <th scope="col" className="px-3 py-2 text-right">Amount</th>
            <th scope="col" className="px-3 py-2 text-right">Change</th>
            <th scope="col" className="px-3 py-2 text-left">Invoice</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => {
            const change = changeText(reading.changeUnits);
            return (
              <tr key={reading.id} className="border-t">
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDate(reading.readingDate)}
                    {reading.isOpening && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Opening
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {reading.isOpening ? "—" : formatUnits(reading.previousReading)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {formatUnits(reading.readingValue)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {reading.isOpening ? "—" : formatUnits(reading.unitsConsumed)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {reading.isOpening ? "—" : formatKES(reading.amountKes ?? 0)}
                </td>
                <td className={cn("px-3 py-2.5 text-right text-xs font-semibold tabular-nums", change?.tone)}>
                  {change?.label ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  {reading.isOpening ? (
                    <span className="text-xs text-muted-foreground">No charge</span>
                  ) : reading.invoiceNumber ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">{reading.invoiceNumber}</span>
                      {reading.invoiceStatus && <StatusBadge status={reading.invoiceStatus} />}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MeterReadingsCard() {
  const history = useMeterHistory();
  const readings = history.data?.readings ?? [];
  const latest = history.data?.latest ?? null;
  const chart = history.data?.chart ?? [];

  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-muted-foreground">
          Billed at KES {history.data?.tariffPerUnitKes ?? 150} per unit
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Droplets className="size-3.5" />
          {history.data ? `${history.data.billedCount} reading${history.data.billedCount === 1 ? "" : "s"}` : "Readings"}
        </span>
      </div>

      {history.isLoading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="flex h-40 items-end gap-3">
            {[62, 80, 54, 92, 70, 44].map((height, i) => (
              <div key={i} className="skeleton flex-1 rounded-t-md" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      ) : history.error ? (
        <p className="mt-6 text-sm text-muted-foreground">
          We couldn&rsquo;t load your readings right now. Please refresh in a moment.
        </p>
      ) : readings.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No readings yet"
          description="Your usage appears here as soon as the first meter reading is billed."
        />
      ) : (
        <>
          {latest && (
            <div className="mt-5">
              <LatestCard reading={latest} />
            </div>
          )}
          {chart.length > 0 && <MeterChart chart={chart} />}
          <ReadingsTable readings={readings} />
        </>
      )}
    </Panel>
  );
}
