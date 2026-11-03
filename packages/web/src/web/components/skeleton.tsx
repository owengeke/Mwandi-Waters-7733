import { cn } from "../lib/utils";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** A few list-shaped skeleton rows for panels and cards. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="w-full space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Table-body skeleton rows, one cell per column. */
export function SkeletonTableRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="border-t" aria-hidden>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="px-4 py-3.5">
              <Skeleton className={cn("h-4", column === 0 ? "w-24" : column === columns - 1 ? "w-16" : "w-full max-w-[160px]")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}