import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useUsage(month: string) {
  return useQuery(orpc.usage.list.queryOptions({ input: { month } }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.usage.key() });
    qc.invalidateQueries({ queryKey: orpc.invoices.key() });
    qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
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