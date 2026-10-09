import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useDashboardSummary() {
  return useQuery(orpc.dashboard.summary.queryOptions());
}
