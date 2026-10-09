/**
 * Human-readable identifiers derived from the row's autoincrement id:
 * REQ-0001, ACC-0001, MTR-0001, INV-00001. Width grows naturally past 9999.
 */
const fmt = (prefix: string, id: number, width = 4) => `${prefix}-${String(id).padStart(width, "0")}`;

export const requestRef = (id: number) => fmt("REQ", id);
export const accountNumber = (id: number) => fmt("ACC", id);
export const meterNumber = (id: number) => fmt("MTR", id);
export const invoiceNumber = (id: number) => fmt("INV", id, 5);

/** Unique placeholder used between INSERT and the id-based UPDATE inside a transaction. */
export const pending = () => `PENDING-${crypto.randomUUID()}`;
