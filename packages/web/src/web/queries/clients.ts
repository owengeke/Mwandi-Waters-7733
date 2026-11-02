import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { ClientStatus } from "../../api/database/schema";

export function useClients(params: { status?: ClientStatus; search?: string } = {}) {
  return useQuery(orpc.clients.list.queryOptions({ input: { limit: 100, offset: 0, ...params } }));
}
export function useClient(id: number) {
  return useQuery(orpc.clients.get.queryOptions({ input: { id } }));
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation(
    orpc.clients.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.clients.key() });
        qc.invalidateQueries({ queryKey: orpc.usage.key() });
        qc.invalidateQueries({ queryKey: orpc.dashboard.key() });
      },
    }),
  );
}
