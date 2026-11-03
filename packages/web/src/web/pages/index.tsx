import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Clock,
  ClipboardList,
  FileText,
  Loader2,
  Users,
} from "lucide-react";
import { StatusBadge } from "../components/status-badge";
import { useClients } from "../queries/clients";
import { useDashboardSummary } from "../queries/dashboard";
import { useInstallations, useMarkInstallationPaid } from "../queries/installations";
import { useInvoices } from "../queries/invoices";
import { useMe } from "../queries/portal";
import { formatDate, formatKES, formatUnits } from "../lib/format";
import { useCountUp } from "../lib/motion";
import { Skeleton, SkeletonTableRows } from "../components/skeleton";
import { cn } from "../lib/utils";

type InvoiceRow = NonNullable<ReturnType<typeof useInvoices>["data"]>[number];
type InstallationRow = NonNullable<ReturnType<typeof useInstallations>["data"]>[number];

const BILLED_COLOR = "#38BDF8";
const COLLECTED_COLOR = "#4F46E5";

const DATE_LABEL = new Intl.DateTimeFormat("en-KE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const iso = (v: string) => new Date(`${v}T00:00:00`);

const shortDate = (v: string) => {
  const d = iso(v);
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
};

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatPeriod(start: string, end: string) {
  const a = iso(start);
  const b = iso(end);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} to ${b.getDate()} ${SHORT_MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Billed and collected totals per billing month, oldest first. */
function buildSeries(rows: InvoiceRow[]) {
  const buckets = new Map<string, { billed: number; collected: number }>();
  for (const { invoice } of rows) {
    const key = invoice.billingPeriodStart.slice(0, 7);
    const bucket = buckets.get(key) ?? { billed: 0, collected: 0 };
    bucket.billed += invoice.amountDueKes ?? 0;
    bucket.collected += invoice.amountPaidKes ?? 0;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, totals]) => {
      const month = Number(key.slice(5));
      return {
        key,
        label: SHORT_MONTHS[month - 1],
        ...totals,
      };
    });
}

/** Rounds the tallest bar up to a tidy axis maximum with three divisions. */
function axisMax(values: number[]) {
  const max = Math.max(0, ...values);
  if (max <= 0) return 3000;
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised <= 1.5 ? 1 : normalised <= 3 ? 2 : normalised <= 7 ? 5 : 10) * magnitude;
  return step * 3;
}

function axisLabel(value: number) {
  if (value === 0) return "0";
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function remaining(invoice: InvoiceRow["invoice"]) {
  return Math.max(0, (invoice.amountDueKes ?? 0) - invoice.amountPaidKes);
}

function reminderHref(phone: string | undefined, message: string) {
  if (!phone) return undefined;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

const TONES = {
  blue: {
    card: "border-[#d5eafb] bg-[#eaf5fc] dark:border-primary/25 dark:bg-primary/10",
    icon: "bg-[#0077b6] text-white dark:bg-primary dark:text-primary-foreground",
    value: "text-[#0077b6] dark:text-sky-300",
  },
  red: {
    card: "border-[#f8dad7] bg-[#fdf0ef] dark:border-destructive/25 dark:bg-destructive/10",
    icon: "bg-[#dc2626] text-white",
    value: "text-[#c62828] dark:text-red-400",
  },
  violet: {
    card: "border-[#e6ddfb] bg-[#f4f0fe] dark:border-violet-400/25 dark:bg-violet-500/10",
    icon: "bg-[#7c3aed] text-white",
    value: "text-[#6d28d9] dark:text-violet-300",
  },
  orange: {
    card: "border-[#fbe4c9] bg-[#fff5e9] dark:border-amber-400/25 dark:bg-amber-500/10",
    icon: "bg-[#ea580c] text-white",
    value: "text-[#b45309] dark:text-amber-400",
  },
} as const;

type Tone = keyof typeof TONES;

/** Money that counts up once, then keeps its KES formatting and two decimals. */
function CountKes({ value }: { value: number | undefined }) {
  const counted = useCountUp(value);
  return <>{formatKES(value === undefined ? undefined : counted)}</>;
}

/** A whole number that counts up once. */
function CountInt({ value }: { value: number | undefined }) {
  const counted = useCountUp(value);
  return <>{value === undefined ? 0 : Math.round(counted)}</>;
}

function KpiCard({
  label,
  value,
  caption,
  icon,
  tone,
  index,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ReactNode;
  tone: Tone;
  index: number;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      style={{ "--i": index } as React.CSSProperties}
      className={cn("rise rounded-2xl border p-5", t.card)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-foreground/80">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.icon)}>
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <p
          className={cn(
            "mt-1 font-display text-[1.65rem] font-bold leading-tight tracking-tight tabular-nums",
            t.value,
          )}
        >
          {value}
        </p>
      )}
      <p className="mt-1 text-[13px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function SectionTitle({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2.5 shrink-0 rounded-[3px]", dot)} aria-hidden />
      <h2 className="text-lg font-bold text-foreground">{children}</h2>
    </div>
  );
}

function AccountChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-[#eef2ff] px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium tracking-tight text-[#4f46e5] dark:bg-indigo-500/15 dark:text-indigo-300">
      {children}
    </span>
  );
}

function ChartCard({ series }: { series: ReturnType<typeof buildSeries> }) {
  const top = axisMax(series.flatMap((s) => [s.billed, s.collected]));
  const ticks = [0, top / 3, (top / 3) * 2, top];

  return (
    <section className="rise rounded-2xl border bg-card p-5 md:p-6" style={{ "--i": 5 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle dot="bg-[#38bdf8]">Billed vs collected</SectionTitle>
        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: BILLED_COLOR }} aria-hidden />
            Billed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: COLLECTED_COLOR }} aria-hidden />
            Collected
          </span>
        </div>
      </div>

      {series.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No invoices to chart yet.</p>
      ) : (
        <>
          <div className="mt-7 grid grid-cols-[auto_1fr] gap-x-3">
            <div className="relative h-[210px]" aria-hidden>
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{ top: `${100 - (tick / top) * 100}%` }}
                >
                  {axisLabel(tick)}
                </span>
              ))}
            </div>
            <div>
              <div className="relative h-[210px] border-b border-border">
                {ticks.map((tick) =>
                  tick > 0 ? (
                    <div
                      key={tick}
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ bottom: `${(tick / top) * 100}%` }}
                    />
                  ) : null,
                )}
                <div className="absolute inset-0 flex items-end justify-around gap-1 sm:gap-2">
                  {series.map((point, i) => (
                    <button
                      key={point.key}
                      type="button"
                      aria-label={`${point.label}: billed ${formatKES(point.billed)}, collected ${formatKES(point.collected)}`}
                      className="chart-col relative flex h-full flex-1 cursor-default items-end justify-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:gap-1.5"
                    >
                      <span
                        className="grow-bar block w-full max-w-[30px] rounded-t-md"
                        style={{
                          height: `${(point.billed / top) * 100}%`,
                          minHeight: point.billed > 0 ? 2 : 0,
                          backgroundColor: BILLED_COLOR,
                          "--i": i * 2,
                        } as React.CSSProperties}
                      />
                      <span
                        className="grow-bar block w-full max-w-[30px] rounded-t-md"
                        style={{
                          height: `${(point.collected / top) * 100}%`,
                          minHeight: point.collected > 0 ? 2 : 0,
                          backgroundColor: COLLECTED_COLOR,
                          "--i": i * 2 + 1,
                        } as React.CSSProperties}
                      />
                      <span aria-hidden="true" className="chart-tip bottom-full mb-1 rounded-lg border bg-popover px-2.5 py-1.5 text-[11px] font-medium text-popover-foreground shadow-md">
                        {point.label}: {formatKES(point.billed)} billed · {formatKES(point.collected)} collected
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex justify-around gap-1 sm:gap-2">
                {series.map((point) => (
                  <span key={point.key} className="flex-1 text-center text-xs text-muted-foreground">
                    {point.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function AttentionRow({
  overdue,
  fee,
  phone,
  paying,
  onMarkPaid,
}: {
  overdue?: InvoiceRow;
  fee?: InstallationRow;
  phone?: string;
  paying?: boolean;
  onMarkPaid?: (id: number) => void;
}) {
  const buttonClass =
    "inline-flex h-11 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:h-10";

  if (overdue) {
    const { invoice, client } = overdue;
    const wa = reminderHref(
      phone,
      `Hello ${client.fullName.split(/\s+/)[0]}, this is Mwandi Waters. Invoice ${invoice.invoiceNumber} for ${formatKES(
        remaining(invoice),
      )} was due on ${formatDate(invoice.dueDate)}. Kindly pay via Paybill 522533, account ${client.accountNumber}.`,
    );
    return (
      <div className="rounded-xl bg-[#fdf1f0] p-4 dark:bg-destructive/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{client.fullName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Invoice {invoice.invoiceNumber}
              <AccountChip>{client.accountNumber}</AccountChip>
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              Overdue since {shortDate(invoice.dueDate)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="whitespace-nowrap font-display text-sm font-bold tabular-nums text-foreground">
              {formatKES(remaining(invoice))}
            </p>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClass}>
                Send reminder
              </a>
            ) : (
              <button type="button" disabled title="No phone number on file" className={buttonClass}>
                Send reminder
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fee) {
    return (
      <div className="rounded-xl bg-[#fff5e9] p-4 dark:bg-amber-500/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{fee.fullName}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              Request {fee.referenceNumber}, {fee.physicalAddress}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#b45309] dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              Awaiting installation fee
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="whitespace-nowrap font-display text-sm font-bold tabular-nums text-foreground">
              {formatKES(fee.installationFeeKes)}
            </p>
            <button
              type="button"
              onClick={() => onMarkPaid?.(fee.id)}
              disabled={paying}
              aria-busy={paying || undefined}
              className={buttonClass}
            >
              {paying ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Recording…
                </>
              ) : (
                "Record payment"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function Dashboard() {
  const me = useMe();
  const summary = useDashboardSummary();
  const invoices = useInvoices();
  const installations = useInstallations();
  const clients = useClients();
  const markPaid = useMarkInstallationPaid();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => invoices.data ?? [], [invoices.data]);

  // Briefly tint any invoice that appears after the first load (e.g. just issued).
  const knownInvoiceIds = useRef<Set<number> | null>(null);
  const [flashIds, setFlashIds] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const ids = rows.map(({ invoice }) => invoice.id);
    if (knownInvoiceIds.current === null) {
      knownInvoiceIds.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !knownInvoiceIds.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => knownInvoiceIds.current!.add(id));
    setFlashIds(new Set(fresh));
    const timer = window.setTimeout(() => setFlashIds(new Set()), 1400);
    return () => window.clearTimeout(timer);
  }, [rows]);
  const series = useMemo(() => buildSeries(rows), [rows]);
  const overdue = useMemo(
    () =>
      rows
        .filter((row) => row.invoice.status === "OVERDUE")
        .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate)),
    [rows],
  );
  const feeRequests = useMemo(
    () => (installations.data ?? []).filter((row) => row.status === "APPROVED_PENDING_PAYMENT"),
    [installations.data],
  );
  const clientsById = useMemo(() => new Map((clients.data ?? []).map((c) => [c.id, c])), [clients.data]);

  const openInvoices = rows.filter((row) => remaining(row.invoice) > 0.004).length;
  const attention = [
    ...overdue.slice(0, 1).map((row) => ({ kind: "overdue" as const, row })),
    ...feeRequests.slice(0, 1).map((row) => ({ kind: "fee" as const, row })),
    ...overdue.slice(1, 2).map((row) => ({ kind: "overdue" as const, row })),
    ...feeRequests.slice(1, 2).map((row) => ({ kind: "fee" as const, row })),
  ].slice(0, 2);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        ({ invoice, client }) =>
          invoice.invoiceNumber.toLowerCase().includes(q) ||
          client.fullName.toLowerCase().includes(q) ||
          client.accountNumber.toLowerCase().includes(q),
      )
    : rows;
  const recent = [...filtered].sort((a, b) => b.invoice.id - a.invoice.id).slice(0, 6);

  const s = summary.data;
  const firstName = me.data?.name?.trim().split(/\s+/)[0] ?? "";
  const greeting = greetingFor(new Date());
  const today = DATE_LABEL.format(new Date()).replace(",", "");
  const oldestOverdue = overdue[0]?.invoice.dueDate;

  return (
    <>
      <header className="rise mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight text-foreground md:text-[2.1rem]">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{today}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="dashboard-search" className="sr-only">
            Search invoices
          </label>
          <input
            id="dashboard-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, accounts, invoices"
            aria-label="Search clients, accounts and invoices"
            className="h-11 w-full rounded-xl border border-input bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 sm:w-72"
          />
          <Link
            to="/usage"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter readings
          </Link>
        </div>
      </header>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={1}
          tone="blue"
          label="Outstanding balance"
          icon={<FileText className="size-[18px]" />}
          loading={summary.isLoading}
          value={<CountKes value={s?.outstandingKes} />}
          caption={`${openInvoices} open invoice${openInvoices === 1 ? "" : "s"}`}
        />
        <KpiCard
          index={2}
          tone="red"
          label="Overdue"
          icon={<Clock className="size-[18px]" />}
          loading={summary.isLoading}
          value={<CountKes value={s?.overdue.amountKes} />}
          caption={`${s?.overdue.count ?? 0} invoice${(s?.overdue.count ?? 0) === 1 ? "" : "s"}${
            oldestOverdue ? `, past due ${shortDate(oldestOverdue)}` : ""
          }`}
        />
        <KpiCard
          index={3}
          tone="violet"
          label="Active clients"
          icon={<Users className="size-[18px]" />}
          loading={summary.isLoading}
          value={<CountInt value={s?.clients.active} />}
          caption="Billed at KES 150 per unit"
        />
        <KpiCard
          index={4}
          tone="orange"
          label="Connection requests"
          icon={<ClipboardList className="size-[18px]" />}
          loading={summary.isLoading}
          value={<CountInt value={s?.openInstallationRequests} />}
          caption={feeRequests.length > 0 ? "Awaiting installation fee" : "Awaiting review or installation"}
        />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.75fr_1fr]">
        <ChartCard series={series} />

        <section className="rise rounded-2xl border bg-card p-5 md:p-6" style={{ "--i": 6 } as React.CSSProperties}>
          <SectionTitle dot="bg-[#f97316]">Needs attention</SectionTitle>
          <div className="mt-5 space-y-3">
            {attention.length === 0 ? (
              <p className="rounded-xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
                You're all caught up. No overdue invoices or pending fees.
              </p>
            ) : (
              attention.map((item) =>
                item.kind === "overdue" ? (
                  <AttentionRow
                    key={`invoice-${item.row.invoice.id}`}
                    overdue={item.row}
                    phone={clientsById.get(item.row.client.id)?.phoneNumber}
                  />
                ) : (
                  <AttentionRow
                    key={`request-${item.row.id}`}
                    fee={item.row}
                    paying={markPaid.isPending && markPaid.variables?.id === item.row.id}
                    onMarkPaid={(id) => markPaid.mutate({ id })}
                  />
                ),
              )
            )}
          </div>
        </section>
      </div>

      <section className="rise overflow-hidden rounded-2xl border bg-card" style={{ "--i": 7 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 md:px-6">
          <SectionTitle dot="bg-[#7c3aed]">Recent invoices</SectionTitle>
          <Link
            to="/invoices"
            className="inline-flex h-11 items-center text-sm font-semibold text-primary hover:underline"
          >
            View all invoices
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Invoice</th>
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Client</th>
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Billing period</th>
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Units</th>
                <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">Amount due</th>
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.isLoading ? (
                <SkeletonTableRows rows={6} columns={6} />
              ) : invoices.error ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-destructive">
                    {invoices.error instanceof Error ? invoices.error.message : "Could not load invoices."}
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-sm text-muted-foreground">
                    {q ? `No invoices match “${query.trim()}”.` : "No invoices issued yet."}
                  </td>
                </tr>
              ) : (
                recent.map(({ invoice, client }) => (
                  <tr
                    key={invoice.id}
                    className={cn(
                      "transition-colors hover:bg-muted/50",
                      flashIds.has(invoice.id) && "row-flash",
                    )}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-foreground md:px-6">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 md:px-6">
                      <span className="text-foreground">{client.fullName}</span>{" "}
                      <AccountChip>{client.accountNumber}</AccountChip>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground md:px-6">
                      {formatPeriod(invoice.billingPeriodStart, invoice.billingPeriodEnd)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 md:px-6">
                      <span className="font-display font-semibold tabular-nums text-[#4f46e5] dark:text-indigo-300">
                        {formatUnits(invoice.consumptionUnits)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right font-display font-bold tabular-nums text-foreground md:px-6">
                      {formatKES(invoice.amountDueKes)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 md:px-6">
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}