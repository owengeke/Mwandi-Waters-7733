import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Sends (or re-sends) the public "Complete your details" link for an application. */
export function useSendOnboardingLink() {
  return useMutation(orpc.onboarding.start.mutationOptions());
}

/** Sends a set-password link to a walk-in client. */
export function useSendClientLink() {
  const qc = useQueryClient();
  return useMutation(
    orpc.onboarding.startClient.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.clients.key() }),
    }),
  );
}

/**
 * Public view for a one-time link. Carries only the token holder's own saved
 * fields. Retries are off: an invalid link will never become valid, and the
 * server rate-limits this endpoint.
 */
export function useOnboardingView(token: string) {
  return useQuery({
    ...orpc.onboarding.get.queryOptions({ input: { token } }),
    enabled: token.length > 0,
    retry: false,
    staleTime: 0,
  });
}

/**
 * Saves one onboarding step. The caller keeps the returned progress and the
 * form state locally instead of refetching: a client set-password token is
 * marked used by step 4, so a refetch after completion would look expired.
 */
export function useSaveOnboardingStep() {
  return useMutation(orpc.onboarding.saveStep.mutationOptions());
}
