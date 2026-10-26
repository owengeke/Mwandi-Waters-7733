import { BadgeCheck, Building2, Phone, ShieldCheck, Smartphone } from "lucide-react";
import type { Client } from "../../../api/database/schema";
import { formatDate, formatPhone } from "../../lib/format";
import { StatusBadge } from "../status-badge";
import { DemoBadge, Panel, Skeleton } from "./section";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}

export function AccountDetailsCard({
  client,
  loading,
  demoMode,
  paybill,
}: {
  client: Client | undefined;
  loading: boolean;
  demoMode: boolean;
  paybill: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">Account details</h3>
            <p className="text-xs text-muted-foreground">Your water service record.</p>
          </div>
        </div>

        {loading || !client ? (
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <dl className="mt-4">
            <Row label="Customer name" value={client.fullName} />
            <Row
              label="Account number"
              value={<span className="font-mono text-xs">{client.accountNumber}</span>}
            />
            <Row label="Meter number" value={<span className="font-mono text-xs">{client.meterNumber}</span>} />
            <Row label="Phone number" value={<span className="tabular-nums">{formatPhone(client.phoneNumber)}</span>} />
            <Row label="Service status" value={<StatusBadge status={client.status} />} />
            <Row label="Customer since" value={formatDate(client.createdAt)} />
          </dl>
        )}
      </Panel>

      <Panel className="relative overflow-hidden p-5 md:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold">How to pay</h3>
            <p className="text-xs text-muted-foreground">M-Pesa Paybill, any time.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Paybill</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-tight">{paybill || "—"}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Account</p>
            <p className="mt-1 truncate font-mono text-sm font-bold tracking-tight">{client?.accountNumber ?? "—"}</p>
          </div>
        </div>

        <ol className="mt-4 space-y-2.5 text-xs text-muted-foreground">
          {[
            "Open M-Pesa and choose Lipa na M-Pesa → Paybill.",
            `Enter business number ${paybill || "—"} and your account number as the reference.`,
            "Enter the amount and confirm with your M-Pesa PIN.",
          ].map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Payments post to your account automatically.
        </div>

        {demoMode && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/[0.06] p-3">
            <div className="flex items-center gap-2">
              <DemoBadge />
              <span className="text-[11px] font-semibold text-warning">No real money moves</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Daraja credentials are not configured. The Pay button simulates a successful M-Pesa payment so you can
              test the full receipt flow.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3.5 text-primary" />
            Customer care · 0700 000 000
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-3.5 text-success" />
            Official Mwandi Waters channel
          </span>
        </div>
      </Panel>
    </div>
  );
}
