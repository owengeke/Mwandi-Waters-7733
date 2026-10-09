import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { InstallationStatus } from "../../api/database/schema";

export function useInstallations(params: { status?: InstallationStatus; search?: string } = {}) {
  return useQuery(orpc.installations.list.queryOptions({ input: { limit: 100, offset: 0, ...params } }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.installations.key() });
    qc.invalidateQueries({ queryKey: orpc.clients.key() });
    qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
  };
}

export function useCreateInstallation() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.installations.create.mutationOptions({ onSuccess }));
}
export function useApproveInstallation() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.installations.approve.mutationOptions({ onSuccess }));
}
export function useRejectInstallation() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.installations.reject.mutationOptions({ onSuccess }));
}
export function useMarkInstallationPaid() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.installations.markPaid.mutationOptions({ onSuccess }));
}
export function useMarkInstalled() {
  const onSuccess = useInvalidate();
  return useMutation(orpc.installations.markInstalled.mutationOptions({ onSuccess }));
}
