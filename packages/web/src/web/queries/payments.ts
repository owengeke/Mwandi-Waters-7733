import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePayments(params: { clientId?: number } = {}) {
  return useQuery(orpc.payments.list.queryOptions({ input: { limit: 100, offset: 0, ...params } }));
}
