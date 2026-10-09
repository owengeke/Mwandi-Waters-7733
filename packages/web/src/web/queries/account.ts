import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useAccountOverview() {
  return useQuery(orpc.account.overview.queryOptions());
}
