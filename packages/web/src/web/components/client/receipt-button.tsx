import { useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { downloadReceipt, openReceipt } from "../../lib/receipts";
import { cn } from "../../lib/utils";

export function ReceiptButton({
  paymentId,
  receipt,
  mode,
  className,
}: {
  paymentId: number;
  receipt?: string | null;
  mode: "open" | "download";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = mode === "open" ? "Open receipt" : "Download receipt";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "open") await openReceipt(paymentId);
      else await downloadReceipt(paymentId, receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the receipt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-label={`${label}${receipt ? ` ${receipt}` : ""}`}
        title={error ?? label}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground disabled:opacity-60",
          error && "border-destructive/40 text-destructive",
          className,
        )}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : mode === "open" ? (
          <ExternalLink className="size-3.5" />
        ) : (
          <Download className="size-3.5" />
        )}
      </button>
      {error && (
        <span role="alert" className="max-w-[180px] text-right text-[10px] leading-tight text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
