import { cn } from "../lib/utils";
import { humanize } from "../lib/format";

export function FilterTabs<T extends string>({ options, value, onChange }: {
  options: readonly T[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  const all = [undefined, ...options] as (T | undefined)[];
  return (
    <div className="rise mb-4 flex flex-wrap gap-1.5" style={{ "--i": 2 } as React.CSSProperties}>
      {all.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt ?? "ALL"}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {opt ? humanize(opt) : "All"}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
        aria-label={placeholder}
      className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-2 focus:outline-ring sm:w-72"
    />
  );
}
