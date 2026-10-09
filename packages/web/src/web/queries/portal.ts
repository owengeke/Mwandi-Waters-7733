import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { portalAuth } from "../lib/auth";

/** Current session (null when signed out). */
export function useMe() {
  return useQuery(orpc.portal.me.queryOptions({ staleTime: 60_000, retry: false }));
}

export function useApplyConnection() {
  return useMutation(orpc.portal.applyConnection.mutationOptions());
}

export function useTrackApplication() {
  return useMutation(orpc.portal.trackApplication.mutationOptions());
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portalAuth.signOut,
    onSettled: () => {
      qc.clear();
    },
  });
}
