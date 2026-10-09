import { cn } from "../lib/utils";
import { humanize } from "../lib/format";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<string, Tone> = {
  // installation
  PENDING_REVIEW: "info",
  APPROVED_PENDING_PAYMENT: "warning",
  PAID: "success",
  INSTALLED: "success",
  REJECTED: "danger",
  // client
  ACTIVE: "success",
  SUSPENDED: "warning",
  DISCONNECTED: "danger",
  // invoice
  UNPAID: "neutral",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
};

const STYLES: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-primary/12 text-primary",
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STYLES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {humanize(status)}
    </span>
  );
}
