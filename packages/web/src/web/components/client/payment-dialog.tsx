import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Smartphone } from "lucide-react";
import type { Client, Invoice } from "../../../api/database/schema";
import { outstandingKes, roundedStkAmount, usePayMpesa, usePaymentStatus } from "../../queries/account";
import { formatDate, formatKES, formatPhone, formatUnits } from "../../lib/format";
import { Modal } from "../modal";
import { Field, FormError, Input, PrimaryButton } from "../form";
import { Code } from "../code";
import { StatusBadge } from "../status-badge";
import { DemoBadge } from "./section";
import { downloadReceipt } from "../../lib/receipts";

type Step = "form" | "waiting" | "success" | "failed";

interface PaymentResult {
  receipt?: string | null;
  paymentId?: number | null;
  amountKes: number;
  demo: boolean;
}

const isKenyanPhone = (value: string) => /^(?:\+?254|0)[17]\d{8}$/.test(value.replace(/[\s-]/g, ""));

const errorMessage = (cause: unknown) =>
  cause instanceof Error && cause.message ? cause.message : "Could not start the payment. Please try again.";

export function PaymentDialog({
  open,
  onClose,
  onPaid,
  initialInvoice,
  invoices,
  client,
  mpesa,
}: {
  open: boolean;
  onClose: () => void;
  onPaid?: () => void;
  initialInvoice: Invoice | null;
  invoices: Invoice[];
  client: Client | undefined;
  mpesa: { demoMode: boolean; paybill: string };
}) {
  const openInvoices = useMemo(() => invoices.filter((invoice) => outstandingKes(invoice) > 0), [invoices]);

  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const pay = usePayMpesa();
  const statusQuery = usePaymentStatus(step === "waiting" ? checkoutId : null);

  // Keep the latest account data available to the open/close effect without
  // re-running it on every poll (which would wipe the form while typing).
  const latest = useRef({ initialInvoice, openInvoices, clientPhone: client?.phoneNumber ?? "" });
  useEffect(() => {
    latest.current = { initialInvoice, openInvoices, clientPhone: client?.phoneNumber ?? "" };
  });

  // Re-initialise only when the dialog opens, using the clicked invoice when possible.
  useEffect(() => {
    if (!open) return;
    const data = latest.current;
    const target =
      data.initialInvoice && outstandingKes(data.initialInvoice) > 0 ? data.initialInvoice : data.openInvoices[0] ?? null;
    setInvoiceId(target?.id ?? null);
    setAmount(target ? String(roundedStkAmount(outstandingKes(target))) : "");
    setPhone(data.clientPhone);
    setStep("form");
    setError(null);
    setPhoneError(null);
    setCheckoutId(null);
    setResult(null);
  }, [open]);

  const invoice = openInvoices.find((item) => item.id === invoiceId) ?? null;

  // A live STK request is confirmed by the callback and surfaced through polling.
  useEffect(() => {
    if (step !== "waiting") return;
    const data = statusQuery.data;
    if (!data) return;

    if (data.status === "SUCCESS") {
      setResult({
        receipt: data.receipt,
        paymentId: data.paymentId,
        amountKes: data.amountKes,
        demo: data.demo,
      });
      setStep("success");
      setCheckoutId(null);
      onPaid?.();
    } else if (data.status === "FAILED" || data.status === "CANCELLED" || data.status === "TIMED_OUT") {
      setError(data.message ?? "The payment was not completed.");
      setStep("failed");
      setCheckoutId(null);
    }
  }, [step, statusQuery.data, onPaid]);

  const exact = invoice ? outstandingKes(invoice) : 0;
  const rounded = roundedStkAmount(exact);
  const parsed = Number(amount);
  const amountError =
    amount.trim() === ""
      ? "Enter the amount you want to pay."
      : !Number.isFinite(parsed) || parsed <= 0
        ? "Enter a valid amount."
        : !Number.isInteger(parsed)
          ? "M-Pesa charges whole shillings — round the amount up."
          : parsed > rounded
            ? `The most you can pay on this bill is ${formatKES(rounded)}.`
            : null;

  const roundingCredit = Math.max(0, Math.round((rounded - exact) * 100) / 100);
  const remaining = Math.max(0, Math.round((exact - parsed) * 100) / 100);

  const submit = () => {
    setError(null);
    setPhoneError(null);
    if (!invoice) {
      setError("Choose a bill to pay.");
      return;
    }
    if (!isKenyanPhone(phone)) {
      setPhoneError("Enter a valid Kenyan number, e.g. 0712 345 678.");
      return;
    }
    if (amountError) return;

    pay.mutate(
      { invoiceId: invoice.id, phone: phone.trim(), amountKes: parsed },
      {
        onSuccess: (data) => {
          if (data.status === "SUCCESS") {
            setResult({ receipt: data.receipt, paymentId: data.paymentId, amountKes: data.amountKes, demo: data.demo });
            setStep("success");
            onPaid?.();
          } else {
            setCheckoutId(data.checkoutRequestId);
            setStep("waiting");
          }
        },
        onError: (cause) => setError(errorMessage(cause)),
      },
    );
  };

  const close = () => {
    onClose();
  };

  const download = async () => {
    if (!result?.paymentId) return;
    setReceiptBusy(true);
    setError(null);
    try {
      await downloadReceipt(result.paymentId, result.receipt);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReceiptBusy(false);
    }
  };

  const title =
    step === "success" ? "Payment received" : step === "waiting" ? "Approve on your phone" : "Pay your water bill";

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={
        step === "form"
          ? "Pay securely with M-Pesa. Your bill updates as soon as payment is confirmed."
          : undefined
      }
    >
      {step === "success" && result ? (
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-7" />
          </span>
          <p className="mt-4 font-display text-3xl font-bold tracking-tight tabular-nums">{formatKES(result.amountKes)}</p>
          <p className="mt-1 text-sm text-muted-foreground">was received from {formatPhone(client?.phoneNumber ?? phone)}.</p>

          <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-left">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">M-Pesa receipt</span>
              <Code>{result.receipt ?? "Processing"}</Code>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Balance updated</span>
              <span className="font-semibold text-success">Yes</span>
            </div>
            {result.demo && (
              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                <DemoBadge />
                <span className="text-[11px] text-muted-foreground">Simulated — no money moved.</span>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {result.paymentId ? (
              <button
                type="button"
                onClick={download}
                disabled={receiptBusy}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
              >
                {receiptBusy && <Loader2 className="size-4 animate-spin" />}
                Download receipt
              </button>
            ) : null}
            <PrimaryButton type="button" onClick={close} className="h-10 flex-1">
              Done
            </PrimaryButton>
          </div>
          {error && <div className="mt-3"><FormError>{error}</FormError></div>}
        </div>
      ) : step === "waiting" ? (
        <div className="py-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-7 animate-spin" />
          </span>
          <h3 className="mt-4 text-base font-bold">Check your phone</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            We sent an M-Pesa request for <strong className="text-foreground">{formatKES(parsed)}</strong> to{" "}
            <strong className="text-foreground">{formatPhone(phone)}</strong>. Enter your M-Pesa PIN to approve it.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            This page updates automatically. You can close it — the payment will still be applied.
          </p>
          <button
            type="button"
            onClick={close}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border bg-background px-5 text-sm font-semibold hover:bg-muted"
          >
            Close
          </button>
        </div>
      ) : step === "failed" ? (
        <div className="py-3 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" />
          </span>
          <h3 className="mt-4 text-base font-bold">Payment not completed</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            {error ?? "M-Pesa did not confirm the payment. You can try again."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCheckoutId(null);
                setStep("form");
              }}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      ) : !invoice ? (
        <div className="py-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="mt-3 text-sm font-semibold">No open invoices</p>
          <p className="mt-1 text-xs text-muted-foreground">Your account is fully paid up.</p>
          <PrimaryButton type="button" onClick={close} className="mt-5 h-10">
            Close
          </PrimaryButton>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {openInvoices.length > 1 && (
            <Field label="Bill to pay" htmlFor="payment-invoice">
              <select
                id="payment-invoice"
                value={invoiceId ?? ""}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setInvoiceId(id);
                  const next = openInvoices.find((item) => item.id === id);
                  if (next) setAmount(String(roundedStkAmount(outstandingKes(next))));
                  setError(null);
                  setPhoneError(null);
                }}
                className="h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm font-medium focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
              >
                {openInvoices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.invoiceNumber} · {formatKES(outstandingKes(item))} outstanding
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <Code className="text-sm font-semibold">{invoice.invoiceNumber}</Code>
              <StatusBadge status={invoice.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Billing period</dt>
                <dd className="mt-0.5 font-semibold">
                  {formatDate(invoice.billingPeriodStart)} – {formatDate(invoice.billingPeriodEnd)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Consumption</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatUnits(invoice.consumptionUnits)} units</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invoice amount</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatKES(invoice.amountDueKes)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Already paid</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatKES(invoice.amountPaidKes)}</dd>
              </div>
              <div className="col-span-2 flex items-center justify-between border-t pt-2">
                <dt className="font-semibold text-foreground">Remaining balance</dt>
                <dd className="font-display text-base font-bold tabular-nums text-primary">{formatKES(exact)}</dd>
              </div>
            </dl>
          </div>

          <Field label="Amount to pay (KES)" htmlFor="payment-amount" error={amountError}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                KES
              </span>
              <Input
                id="payment-amount"
                inputMode="numeric"
                autoComplete="off"
                className="pl-12 tabular-nums"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                invalid={Boolean(amountError) && amount !== ""}
              />
            </div>
          </Field>

          <Field
            label="M-Pesa phone number"
            htmlFor="payment-phone"
            hint="The number that will receive the M-Pesa prompt."
            error={phoneError}
          >
            <Input
              id="payment-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              invalid={Boolean(phoneError)}
            />
          </Field>

          {rounded > exact && parsed === rounded && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3.5 py-3 text-[12px] leading-relaxed">
              <p className="font-semibold text-foreground">Rounded up for M-Pesa</p>
              <p className="mt-0.5 text-muted-foreground">
                Your balance is {formatKES(exact)}, but M-Pesa charges whole shillings. We&rsquo;ll collect{" "}
                <strong className="text-foreground">{formatKES(rounded)}</strong> and the extra{" "}
                <strong className="text-foreground">{formatKES(roundingCredit)}</strong> stays on your account as
                credit.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm">
            <span className="text-muted-foreground">Remaining after this payment</span>
            <span className="font-bold tabular-nums">{formatKES(remaining)}</span>
          </div>

          {parsed > 0 && parsed < exact && (
            <p className="text-[11px] text-muted-foreground">
              This is a partial payment — {formatKES(remaining)} will remain outstanding on {invoice.invoiceNumber}.
            </p>
          )}

          {mpesa.demoMode && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3.5 py-2.5">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-warning">Demo mode.</span> Daraja credentials are not configured,
                so this payment is simulated and marked in the ledger. No money moves.
              </p>
            </div>
          )}

          {error && <FormError>{error}</FormError>}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" loading={pay.isPending} disabled={Boolean(amountError)} className="sm:min-w-[170px]">
              {pay.isPending ? "Sending request…" : `Pay ${formatKES(parsed || 0)}`}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Modal>
  );
}
