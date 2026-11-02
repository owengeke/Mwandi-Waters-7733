import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useUsage() {
  return useQuery(orpc.usage.list.queryOptions());
}

export function useMeterHistory() {
  return useQuery(orpc.usage.history.queryOptions({ input: {} }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.usage.key() });
    qc.invalidateQueries({ queryKey: orpc.invoices.key() });
    qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
    qc.invalidateQueries({ queryKey: orpc.account.key() });
    qc.invalidateQueries({ queryKey: orpc.clients.key() });
  };
}

export function useRecordUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.record.mutationOptions({ onSuccess }));
}

export function useRecordManyUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.recordMany.mutationOptions({ onSuccess }));
}

export function useSetOpening() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.setOpening.mutationOptions({ onSuccess }));
}

export function useReplaceMeter() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.replaceMeter.mutationOptions({ onSuccess }));
}

export function useCorrectUsage() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.usage.correct.mutationOptions({ onSuccess }));
}
