import { BarChart3, Droplets } from "lucide-react";
import { formatDate, formatKES, formatUnits } from "../../lib/format";
import { cn } from "../../lib/utils";
import { useUsageHistory } from "../../queries/usage";
import { EmptyState, Panel, Skeleton } from "./section";
import type { UsageHistoryPeriod } from "../../../api/lib/usage-history";

const monthShort = new Intl.DateTimeFormat("en-KE", { month: "short", timeZone: "UTC" });
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "1 – 15 Nov 2026" using the invoice's own dates (legacy bills cover a full month). */
const periodText = (period: UsageHistoryPeriod) =>
  period.periodStart === period.periodEnd
    ? formatDate(period.periodStart)
    : `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;

function changeText(change: number | null) {
  if (change === null) return null;
  if (change === 0) return { label: "No change", tone: "text-muted-foreground" };
  const sign = change > 0 ? "+" : "−";
  return {
    label: `${sign}${formatUnits(Math.abs(change))} units`,
    tone: change > 0 ? "text-warning" : "text-success",
  };
}

function LatestCard({ period }: { period: UsageHistoryPeriod | null }) {
  if (!period) return null;
  const change = changeText(period.changeUnits);
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/8 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary-foreground">
            Latest
          </span>
          <p className="mt-2 text-sm font-semibold">{periodText(period)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Your most recent meter reading</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {formatUnits(period.units ?? 0)}
            <span className="ml-1 text-sm font-semibold text-muted-foreground">units</span>
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatKES(period.amountKes ?? 0)}</p>
          {change && (
            <p className={cn("mt-1 text-xs font-semibold tabular-nums", change.tone)}>{change.label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Theme-aware bars; the table below is the accessible equivalent. */
function UsageChart({ periods }: { periods: UsageHistoryPeriod[] }) {
  const rows = [...periods].reverse();
  const max = Math.max(...rows.map((p) => p.units ?? 0), 1);
  const summary = rows
    .map((p) => `${periodText(p)}: ${p.hasReading ? `${formatUnits(p.units ?? 0)} units` : "no reading yet"}`)
    .join("; ");

  return (
    <figure className="m-0 mt-6">
      <div className="overflow-x-auto pb-1" aria-hidden="true">
        <div className="flex min-w-max items-end gap-2 sm:gap-3">
          {rows.map((period) => {
            const units = period.units ?? 0;
            const height = period.hasReading ? Math.max(6, (units / max) * 100) : 4;
            const start = asDate(period.windowStart);
            return (
              <div key={period.windowStart} className="flex w-9 flex-col items-center sm:w-11">
                <span
                  className={cn(
                    "mb-1.5 h-4 whitespace-nowrap text-[10px] font-semibold tabular-nums",
                    period.isLatest ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {period.hasReading ? formatUnits(units) : "—"}
                </span>
                <div className="flex h-32 w-full items-end justify-center border-b border-dashed border-border/80">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-colors",
                      !period.hasReading && "bg-muted",
                      period.hasReading && period.isLatest && "bg-primary",
                      period.hasReading && !period.isLatest && "bg-primary/25 hover:bg-primary/40",
                    )}
                    style={{ height: `${height}%` }}
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

function HistoryTable({ periods }: { periods: UsageHistoryPeriod[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Your water usage by 15-day period, newest first.</caption>
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Period</th>
            <th scope="col" className="px-3 py-2 text-right">Units</th>
            <th scope="col" className="px-3 py-2 text-right">Amount</th>
            <th scope="col" className="px-3 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const change = changeText(period.changeUnits);
            return (
              <tr key={period.windowStart} className={cn("border-t", !period.hasReading && "text-muted-foreground")}>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {periodText(period)}
                    {period.isLatest && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Latest
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {period.hasReading ? formatUnits(period.units ?? 0) : "No reading yet"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {period.hasReading ? formatKES(period.amountKes ?? 0) : "—"}
                </td>
                <td className={cn("px-3 py-2.5 text-right text-xs font-semibold tabular-nums", change?.tone)}>
                  {change?.label ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function UsageHistoryCard() {
  const history = useUsageHistory();
  const periods = history.data?.periods ?? [];
  const latest = history.data?.latest ?? null;

  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Usage history</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Readings every 15 days — units used and what they cost at KES {history.data?.tariffPerUnitKes ?? 150} per unit.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Droplets className="size-3.5" />
          Updated every 15 days
        </span>
      </div>

      {history.isLoading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="flex h-40 items-end gap-3">
            {[62, 80, 54, 92, 70, 44].map((height, i) => (
              <div key={i} className="flex-1 animate-pulse rounded-t-md bg-muted" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      ) : history.error ? (
        <p className="mt-6 text-sm text-muted-foreground">
          We couldn&rsquo;t load your readings right now. Please refresh in a moment.
        </p>
      ) : periods.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No readings yet"
          description="Your usage appears here as soon as the first 15-day reading is issued."
        />
      ) : (
        <>
          <div className="mt-5">
            <LatestCard period={latest} />
          </div>
          <UsageChart periods={periods} />
          <HistoryTable periods={periods} />
        </>
      )}
    </Panel>
  );
}
