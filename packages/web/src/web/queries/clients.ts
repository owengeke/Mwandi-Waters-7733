import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { ClientStatus } from "../../api/database/schema";

export function useClients(params: { status?: ClientStatus; search?: string } = {}) {
  return useQuery(orpc.clients.list.queryOptions({ input: { limit: 100, offset: 0, ...params } }));
}

export function useClient(id: number | undefined) {
  return useQuery({
    ...orpc.clients.get.queryOptions({ input: { id: id ?? 0 } }),
    enabled: typeof id === "number" && id > 0,
  });
}

export function useClientDrafts() {
  return useQuery(orpc.clients.listDrafts.queryOptions({ input: { limit: 100, offset: 0 } }));
}

export function usePreviewAccountNumber() {
  return useQuery(orpc.clients.previewAccountNumber.queryOptions());
}

/** Debounced callers pass null until the number is complete and valid. */
export function useDuplicateCheck(phoneNumber: string | null) {
  return useQuery({
    ...orpc.clients.checkDuplicate.queryOptions({ input: { phoneNumber: phoneNumber ?? "" } }),
    enabled: Boolean(phoneNumber),
  });
}

function useInvalidateClients() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.clients.key() });
    qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
    qc.invalidateQueries({ queryKey: orpc.usage.key() });
  };
}

export function useCreateClient() {
  const onSuccess = useInvalidateClients();
  return useMutation(orpc.clients.create.mutationOptions({ onSuccess }));
}

export function useSaveClientDraft() {
  const onSuccess = useInvalidateClients();
  return useMutation(orpc.clients.saveDraft.mutationOptions({ onSuccess }));
}