import { sql } from "drizzle-orm";
import { clients } from "../database/schema";
import { accountNumber, meterNumber } from "./identifiers";

/**
 * Next account/meter numbers are derived from the highest number already
 * assigned — not from the row id — so saved drafts never leave gaps and a
 * manually supplied meter never collides with the generated sequence.
 *
 * The numbers stay in the existing ACC-XXXX / MTR-XXXX formats.
 */
export const nextAccountSql = sql<number>`coalesce(max(cast(substr(${clients.accountNumber}, 5) as integer)), 0)`;
export const nextMeterSql = sql<number>`coalesce(max(cast(substr(${clients.meterNumber}, 5) as integer)), 0)`;

export const nextAccountNumber = (maxAccount: number) => accountNumber(Number(maxAccount) + 1);
export const nextMeterNumber = (maxMeter: number) => meterNumber(Number(maxMeter) + 1);