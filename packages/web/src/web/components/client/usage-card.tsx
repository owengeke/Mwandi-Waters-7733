import { BarChart3, Droplets } from "lucide-react";
import type { Invoice } from "../../../api/database/schema";
import { formatKES, formatUnits } from "../../lib/format";
import { cn } from "../../lib/utils";
import { EmptyState, Panel } from "./section";

const MONTH = new Intl.DateTimeFormat("en-KE", { month: "short" });

const monthOf = (isoDate: string) => MONTH.format(new Date(`${isoDate}T00:00:00`));

export function UsageCard({ invoices, loading }: { invoices: Invoice[]; loading: boolean }) {
  const rows = [...invoices]
    .sort((a, b) => a.billingPeriodStart.localeCompare(b.billingPeriodStart))
    .slice(-6);
  const max = Math.max(...rows.map((invoice) => invoice.consumptionUnits), 1);
  const total = rows.reduce((sum, invoice) => sum + invoice.consumptionUnits, 0);
  const average = rows.length ? total / rows.length : 0;
  const latest = rows.at(-1);

  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Consumption history</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Water used per billing period, in units (m³).</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Droplets className="size-3.5" />
          KES 150 / unit
        </span>
      </div>

      {loading ? (
        <div className="mt-6 flex h-48 items-end gap-4">
          {[62, 80, 54, 92, 70, 44].map((height, i) => (
            <div key={i} className="flex-1 animate-pulse rounded-t-md bg-muted" style={{ height: `${height}%` }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No usage recorded yet"
          description="Your consumption chart appears once you have a bill."
        />
      ) : (
        <>
          <figure className="m-0 mt-6 flex items-end gap-2 sm:gap-4">
            <figcaption className="sr-only">
              Monthly water consumption:{" "}
              {rows
                .map((invoice) => `${monthOf(invoice.billingPeriodStart)} ${formatUnits(invoice.consumptionUnits)} units`)
                .join(", ")}
            </figcaption>
            {rows.map((invoice, index) => {
              const isLatest = index === rows.length - 1;
              const height = Math.max(6, (invoice.consumptionUnits / max) * 100);
              return (
                <div key={invoice.id} className="flex min-w-0 flex-1 flex-col items-center">
                  <span
                    className={cn(
                      "mb-1.5 whitespace-nowrap text-[10px] font-semibold tabular-nums",
                      isLatest ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {formatUnits(invoice.consumptionUnits)}
                  </span>
                  <div className="flex h-36 w-full items-end justify-center border-b border-dashed border-border/80">
                    <div
                      title={`${monthOf(invoice.billingPeriodStart)}: ${formatUnits(invoice.consumptionUnits)} units · ${formatKES(invoice.amountDueKes)}`}
                      className={cn(
                        "w-full max-w-12 rounded-t-md transition-colors",
                        isLatest ? "bg-primary" : "bg-primary/25 hover:bg-primary/40",
                      )}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {monthOf(invoice.billingPeriodStart)}
                  </span>
                  <span className="mt-0.5 hidden whitespace-nowrap text-[10px] text-muted-foreground sm:block">
                    {formatKES(invoice.amountDueKes)}
                  </span>
                </div>
              );
            })}
          </figure>

          <dl className="mt-6 grid grid-cols-3 divide-x rounded-lg border bg-muted/30">
            <div className="px-4 py-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Latest period</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums">
                {latest ? `${formatUnits(latest.consumptionUnits)} units` : "—"}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Average</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums">{formatUnits(average)} units</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums">{formatUnits(total)} units</dd>
            </div>
          </dl>
        </>
      )}
    </Panel>
  );
}
