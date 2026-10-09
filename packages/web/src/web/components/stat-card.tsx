import { cn } from "../lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  index?: number;
  emphasis?: boolean;
}

export function StatCard({ label, value, caption, icon, loading, index = 0, emphasis }: StatCardProps) {
  return (
    <div
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "rise relative overflow-hidden rounded-xl border bg-card p-5",
        emphasis && "border-transparent bg-[#0077B6] text-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.08em]",
            emphasis ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {icon && <span className={cn(emphasis ? "text-white/80" : "text-primary")}>{icon}</span>}
      </div>
      {loading ? (
        <div className={cn("mt-3 h-8 w-32 animate-pulse rounded-md", emphasis ? "bg-white/20" : "bg-muted")} />
      ) : (
        <p className="mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tight tabular-nums">{value}</p>
      )}
      {caption && (
        <p className={cn("mt-1 text-xs", emphasis ? "text-white/75" : "text-muted-foreground")}>
          {caption}
        </p>
      )}
    </div>
  );
}
