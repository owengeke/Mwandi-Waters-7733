import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { InvoiceStatus } from "../../api/database/schema";

export function useInvoices(params: { status?: InvoiceStatus; clientId?: number } = {}) {
  return useQuery(orpc.invoices.list.queryOptions({ input: { limit: 100, offset: 0, ...params } }));
}
