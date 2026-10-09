import { cn } from "../lib/utils";

/** Monospace identifier: ACC-XXXX, MTR-XXXX, REQ-XXXX, INV-XXXXX, M-Pesa receipts. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[0.8125rem] font-medium tracking-tight text-foreground", className)}>
      {children}
    </span>
  );
}
