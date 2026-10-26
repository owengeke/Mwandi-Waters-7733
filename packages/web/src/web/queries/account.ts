import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { Invoice, Payment } from "../../api/database/schema";

/** Round to cents before comparing, so float noise never creates a phantom outstanding balance. */
export function outstandingKes(invoice: Pick<Invoice, "amountDueKes" | "amountPaidKes">) {
  const cents = Math.round((invoice.amountDueKes ?? 0) * 100) - Math.round(invoice.amountPaidKes * 100);
  return Math.max(0, cents) / 100;
}

/** M-Pesa only charges whole shillings: round a sub-shilling balance up. */
export const roundedStkAmount = (outstanding: number) => Math.ceil(Math.round(outstanding * 100) / 100);

export function useAccountOverview() {
  return useQuery(orpc.account.overview.queryOptions());
}

function useInvalidateAccount() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.account.key() });
}

/** Starts an STK push (or completes instantly in demo mode). */
export function usePayMpesa() {
  const onSuccess = useInvalidateAccount();
  return useMutation(orpc.account.payMpesa.mutationOptions({ onSuccess }));
}

/**
 * Polls a pending STK request every 3s until it reaches a terminal status.
 * No polling happens in demo mode because `payMpesa` returns SUCCESS at once.
 */
export function usePaymentStatus(checkoutRequestId: string | null) {
  return useQuery({
    ...orpc.account.paymentStatus.queryOptions({ input: { checkoutRequestId: checkoutRequestId ?? "" } }),
    enabled: Boolean(checkoutRequestId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PENDING" ? 3_000 : false;
    },
  });
}

export type { Invoice, Payment };
