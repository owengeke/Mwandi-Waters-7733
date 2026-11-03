import { cn } from "../lib/utils";

/** Two-or-more option segmented control (property type, occupant, and so on). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      aria-label={label}
      className="grid min-w-0 auto-cols-fr grid-flow-col overflow-hidden rounded-lg border border-input"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-11 min-w-0 px-2 text-sm font-semibold transition-colors disabled:opacity-60",
              active ? "bg-[#7c3aed] text-white" : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
