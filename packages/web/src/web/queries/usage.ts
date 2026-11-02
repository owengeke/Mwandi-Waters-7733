import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { UsageHalf } from "../../api/lib/usage-period";

export function useUsage(month: string, half: UsageHalf) {
  return useQuery(orpc.usage.list.queryOptions({ input: { month, half } }));
}

export function useUsageHistory() {
  return useQuery(orpc.usage.history.queryOptions({ input: {} }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.usage.key() });
    qc.invalidateQueries({ queryKey: orpc.invoices.key() });
    qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
    qc.invalidateQueries({ queryKey: orpc.account.key() });
  };
}

export function useIssueUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.issue.mutationOptions({ onSuccess }));
}

export function useBulkUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.bulk.mutationOptions({ onSuccess }));
}

export function useCorrectUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.correct.mutationOptions({ onSuccess }));
}
