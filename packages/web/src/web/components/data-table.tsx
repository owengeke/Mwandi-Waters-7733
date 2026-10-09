import { cn } from "../lib/utils";
import { Loader2 } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: unknown;
  rowKey: (row: T) => string | number;
  empty?: string;
}

export function DataTable<T>({ columns, rows, loading, error, rowKey, empty = "Nothing here yet." }: DataTableProps<T>) {
  return (
    <div className="rise overflow-hidden rounded-xl border bg-card" style={{ "--i": 4 } as React.CSSProperties}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin text-primary" />
                  <span className="mt-2 block text-xs">Loading…</span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-destructive">
                  {error instanceof Error ? error.message : "Could not load data."}
                </td>
              </tr>
            ) : !rows?.length ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-sm text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors hover:bg-accent/40">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-3",
                        c.align === "right" && "text-right tabular-nums",
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
